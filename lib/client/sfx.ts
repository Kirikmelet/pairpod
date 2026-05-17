"use client";

import { useEffect, useRef } from "react";
import { getSupabasePublicConfigOrNull } from "@/utils/supabase/config";

type SoundName = "error" | "goodbye" | "im" | "mail" | "welcome";

const SFX_BUCKET = "sfx";
const SOUND_FILES: Record<SoundName, string> = {
  error: "erro.mp3",
  goodbye: "Goodbye.mp3",
  im: "IM.mp3",
  mail: "You've Got Mail.mp3",
  welcome: "Welcome.mp3",
};

const publicConfig = getSupabasePublicConfigOrNull("lib/client/sfx.ts");
const audioCache = new Map<SoundName, HTMLAudioElement>();
let didInstallUnlockListeners = false;
let didPrimeAudio = false;

export async function playSfx(name: SoundName) {
  if (typeof window === "undefined" || !publicConfig) {
    return;
  }

  try {
    const audio = getAudio(name);
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    await audio.play();
  } catch {}
}

export async function playSfxAndWait(name: SoundName, delayMs = 650) {
  await playSfx(name);
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export function primeSfx() {
  if (typeof window === "undefined" || !publicConfig || didPrimeAudio) {
    return;
  }

  didPrimeAudio = true;

  for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
    try {
      const audio = getAudio(name);
      audio.muted = true;
      audio.volume = 0;
      const playPromise = audio.play();
      void playPromise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.volume = 1;
        })
        .catch(() => {
          audio.muted = false;
          audio.volume = 1;
        });
    } catch {}
  }
}

export function useSfxUnlock() {
  useEffect(() => {
    if (didInstallUnlockListeners || typeof window === "undefined") {
      return;
    }

    didInstallUnlockListeners = true;
    const unlock = () => primeSfx();

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      didInstallUnlockListeners = false;
    };
  }, []);
}

export function useErrorSfx(message: string | null | undefined) {
  const previousMessage = useRef<string | null>(null);

  useEffect(() => {
    const nextMessage = message?.trim() || null;

    if (nextMessage && nextMessage !== previousMessage.current) {
      playSfx("error");
    }

    previousMessage.current = nextMessage;
  }, [message]);
}

function getAudio(name: SoundName) {
  const cached = audioCache.get(name);
  if (cached) {
    return cached;
  }

  const audio = new Audio(getPublicSoundUrl(SOUND_FILES[name]));
  audio.preload = "auto";
  audioCache.set(name, audio);
  return audio;
}

function getPublicSoundUrl(fileName: string) {
  const baseUrl = publicConfig?.url.replace(/\/+$/, "") ?? "";
  return `${baseUrl}/storage/v1/object/public/${SFX_BUCKET}/${encodeURIComponent(fileName)}`;
}
