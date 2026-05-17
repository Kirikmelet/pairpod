"use client";

import { useEffect, useMemo, useState } from "react";

type OverlayTarget = {
  title: string;
  processName: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type OverlayState = {
  platform: string;
  target: OverlayTarget | null;
};

type PairPodDesktopApi = {
  platform: string;
  getOverlayState: () => Promise<OverlayState>;
  onOverlayTargetChanged: (callback: (state: OverlayState) => void) => () => void;
};

declare global {
  interface Window {
    pairpodDesktop?: PairPodDesktopApi;
  }
}

export function DesktopOverlayPage() {
  const [state, setState] = useState<OverlayState>({
    platform: "unknown",
    target: null,
  });

  useEffect(() => {
    const api = window.pairpodDesktop;
    if (!api) {
      return;
    }

    let isMounted = true;
    void api.getOverlayState().then((nextState) => {
      if (isMounted) {
        setState(nextState);
      }
    });
    const unsubscribe = api.onOverlayTargetChanged((nextState) => {
      setState(nextState);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const targetName = useMemo(() => {
    if (!state.target) {
      return "Waiting for an app";
    }

    return state.target.title.trim() || state.target.processName || "Current app";
  }, [state.target]);

  const isWindows = state.platform === "win32";

  return (
    <main className="desktop-overlay-shell">
      <section className="desktop-overlay-card" aria-label="PairPod Windows overlay">
        <header className="desktop-overlay-header">
          <span className="desktop-overlay-orb" aria-hidden="true" />
          <div>
            <p>PairPod Overlay</p>
            <h1>{isWindows ? targetName : "Windows only"}</h1>
          </div>
        </header>

        <div className="desktop-overlay-presence">
          <span className="live-dot" />
          <strong>{state.target?.processName || "No app detected"}</strong>
          <span>{isWindows ? "hooked to foreground app" : "disabled on this OS"}</span>
        </div>

        <nav className="desktop-overlay-actions" aria-label="Overlay actions">
          <a href="/">Pods</a>
          <a href="/chat">Chat</a>
          <a href="/posts">Posts</a>
          <a href="/dms">DMs</a>
        </nav>

        <section className="desktop-overlay-panel">
          <h2>App room</h2>
          <p>
            PairPod will stay beside the active Windows app and keep your pod tools close.
          </p>
        </section>

        <section className="desktop-overlay-panel desktop-overlay-panel--compact">
          <h2>Quick status</h2>
          <p>{state.target ? `${state.target.width}x${state.target.height}` : "Focus an app to attach."}</p>
        </section>
      </section>
    </main>
  );
}
