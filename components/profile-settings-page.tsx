"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useErrorSfx } from "@/lib/client/sfx";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/utils/database.types";
import type { User } from "@supabase/supabase-js";

type ProfileSettingsPageProps = {
  variant?: "page" | "popup";
};

type ExtensionRuntime = {
  runtime?: {
    getURL?: (path: string) => string;
    id?: string;
  };
};

type UserProfileRow = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  username: string | null;
  configurations: Json;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string;
};
const DEFAULT_AVATAR_URL =
  "https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png";
const AVATAR_BUCKET = "profile_pictures";
const USER_PROFILE_COLUMNS =
  "id,auth_user_id,email,username,configurations,display_name,avatar_url,updated_at";

export function ProfileSettingsPage({
  variant = "page",
}: ProfileSettingsPageProps) {
  const isPopup = variant === "popup";
  const nav = useProfileNavLinks();
  const canUseFilePicker = !isPopup || nav.isFullProfileEditor;
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR_URL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorSfx(error);

  const title = useMemo(
    () => displayName.trim() || username.trim() || authEmail || "Your profile",
    [authEmail, displayName, username],
  );

  function hydrateForm(nextProfile: UserProfileRow) {
    const configuration = readConfiguration(nextProfile.configurations);
    setProfile(nextProfile);
    setUsername(nextProfile.username ?? "");
    setDisplayName(nextProfile.display_name ?? configuration.displayName ?? "");
    setAvatarUrl(nextProfile.avatar_url || DEFAULT_AVATAR_URL);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const nextProfile = await loadProfileRequest();

        if (!isMounted) {
          return;
        }

        setAuthEmail(nextProfile.email ?? null);
        hydrateForm(nextProfile);
      } catch (profileError) {
        if (isMounted) {
          setError(
            profileError instanceof Error
              ? profileError.message
              : "Could not load profile.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile) {
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const nextProfile = await updateProfile({
        username: normalizeOptionalText(username),
        displayName: normalizeOptionalText(displayName),
        avatarUrl,
      });

      hydrateForm(nextProfile);
      setStatus("Profile updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !profile) {
      return;
    }

    if (file.type !== "image/png") {
      setError("Please upload a PNG file.");
      return;
    }

    setUploading(true);
    setError(null);
    setStatus(null);

    try {
      const resized = await resizePngToAvatar(file);
      const nextProfile = await uploadAvatar(resized);
      hydrateForm(nextProfile);
      setStatus("Avatar updated.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Could not upload avatar.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className={`app-scene profile-scene ${isPopup ? "profile-scene--popup" : ""}`}>
      <ProfileBackground />
      <div className="app-scene__content profile-scene__content">
        <section className="profile-window xp-window pop-in" aria-labelledby="profile-title">
          <div className="xp-title-bar chat-titlebar">
            <ProfileTitleIcon />
            <span className="xp-title-text">PairPod - Profile Settings</span>
            <div className="xp-title-controls" aria-hidden="true">
              <span className="xp-title-btn xp-title-btn--min">_</span>
              <span className="xp-title-btn xp-title-btn--max">[]</span>
              <span className="xp-title-btn xp-title-btn--close">x</span>
            </div>
          </div>

          <nav className="chat-menu chat-nav profile-nav" aria-label="Profile menu">
            <button type="button" onClick={() => goBack(nav.backHref)}>
              Back
            </button>
            <a href={nav.roomHref}>Room</a>
            <a href={nav.chatHref}>Chat</a>
            <a href={nav.postsHref}>Posts</a>
            <a href={nav.profileHref} className="chat-nav__active">
              Profile
            </a>
          </nav>

          <div className="xp-window-body profile-window__body">
            <header className="profile-header">
              <img className="profile-avatar" src={avatarUrl} alt="" />
              <div>
                <p className="app-eyebrow">account appearance</p>
                <h1 className="profile-title" id="profile-title">
                  {title}
                </h1>
                <p className="app-copy">
                  Username and display name change how you appear in PairPod only.
                </p>
              </div>
            </header>

            {loading ? <p className="status-note">Loading profile...</p> : null}
            {error ? <p className="status-note status-note--error">{error}</p> : null}
            {status ? <p className="status-note status-note--success">{status}</p> : null}

            <form className="profile-form" onSubmit={handleSubmit}>
              <label className="profile-field">
                <span>Username</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="coolbuilder"
                  maxLength={40}
                />
              </label>

              <label className="profile-field">
                <span>Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Cool Builder"
                  maxLength={80}
                />
              </label>

              {canUseFilePicker ? (
                <label className="profile-field">
                  <span>Avatar PNG</span>
                  <input
                    type="file"
                    accept="image/png"
                    onChange={(event) => void handleAvatarChange(event)}
                    disabled={!profile || uploading}
                  />
                </label>
              ) : (
                <div className="profile-field">
                  <span>Avatar PNG</span>
                  <a
                    className="profile-upload-link"
                    href={nav.fullProfileHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open avatar editor
                  </a>
                  <p className="profile-field-note">
                    Opens in a normal tab so the file picker can stay open.
                  </p>
                </div>
              )}

              <button
                className="profile-save-button"
                type="submit"
                disabled={!profile || saving || uploading}
              >
                {saving ? "Saving..." : uploading ? "Uploading..." : "Save profile"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function useProfileNavLinks() {
  const [links, setLinks] = useState({
    backHref: "/pods",
    chatHref: "/chat",
    postsHref: "/posts",
    profileHref: "/profile",
    roomHref: "/pods",
    fullProfileHref: "/profile",
    isFullProfileEditor: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const runtime = getExtensionRuntime();
    const isExtension = Boolean(runtime?.runtime?.id);

    const query = isExtension
      ? (window.location.hash.split("?")[1] ?? "")
      : window.location.search.replace(/^\?/, "");
    const params = new URLSearchParams(query);
    const isFullProfileEditor = params.get("fullProfile") === "1";
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const fullParams = new URLSearchParams(params);
    fullParams.set("fullProfile", "1");
    const fullSuffix = `?${fullParams.toString()}`;
    const extensionProfilePath = `popup.html#/profile${fullSuffix}`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const fullProfileHref = siteUrl
      ? `${siteUrl.replace(/\/+$/, "")}/profile${fullSuffix}`
      : `/profile${fullSuffix}`;

    setLinks({
      backHref: isExtension ? `#/${suffix}` : `/pods${suffix}`,
      chatHref: isExtension ? `#/chat${suffix}` : `/chat${suffix}`,
      postsHref: isExtension ? `#/posts${suffix}` : `/posts${suffix}`,
      profileHref: isExtension ? `#/profile${suffix}` : `/profile${suffix}`,
      roomHref: isExtension ? `#/${suffix}` : `/pods${suffix}`,
      fullProfileHref: isExtension
        ? (runtime?.runtime?.getURL?.(extensionProfilePath) ?? extensionProfilePath)
        : fullProfileHref,
      isFullProfileEditor,
    });
  }, []);

  return links;
}

function getExtensionRuntime() {
  const globalWithRuntime = globalThis as typeof globalThis & {
    browser?: ExtensionRuntime;
    chrome?: ExtensionRuntime;
  };

  return globalWithRuntime.browser ?? globalWithRuntime.chrome ?? null;
}

function goBack(fallbackHref: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (window.history.length <= 1) {
    window.location.href = fallbackHref;
    return;
  }

  window.history.back();

  window.setTimeout(() => {
    if (window.location.hash === "#/profile" || window.location.pathname === "/profile") {
      window.location.href = fallbackHref;
    }
  }, 120);
}

async function loadProfileRequest() {
  if (shouldUseDirectProfileAccess()) {
    return await loadProfileDirect();
  }

  const response = await fetchProfileApi("/api/profile", {
    method: "GET",
  });

  return toUserProfileRow(response);
}

async function updateProfile(patch: {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  if (shouldUseDirectProfileAccess()) {
    return await updateProfileDirect(patch);
  }

  const response = await fetchProfileApi("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return toUserProfileRow(response);
}

async function uploadAvatar(file: Blob) {
  if (shouldUseDirectProfileAccess()) {
    return await uploadAvatarDirect(file);
  }

  const formData = new FormData();
  formData.set("file", file, "avatar.png");

  const response = await fetchProfileApi("/api/profile/avatar", {
    method: "POST",
    body: formData,
  });

  return toUserProfileRow(response);
}

function shouldUseDirectProfileAccess() {
  return Boolean(getExtensionRuntime()?.runtime?.id) && !getRemoteApiUrl("/api/profile");
}

async function loadProfileDirect() {
  const { supabase, user } = await getAuthenticatedDirectProfileClient();
  return await ensureDirectProfile(supabase, user);
}

async function updateProfileDirect(patch: {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const { supabase, user } = await getAuthenticatedDirectProfileClient();
  const profile = await ensureDirectProfile(supabase, user);
  const nextConfiguration = readConfiguration(profile.configurations);
  const nextPatch: Partial<UserProfileRow> = {
    auth_user_id: user.id,
    email: user.email ?? profile.email,
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(patch, "username")) {
    nextPatch.username = normalizeUsernameForProfile(patch.username);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
    const nextDisplayName = normalizeOptionalText(patch.displayName ?? "");
    nextConfiguration.displayName = nextDisplayName ?? "";
    nextPatch.display_name = nextDisplayName;
    nextPatch.configurations = nextConfiguration;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "avatarUrl")) {
    nextPatch.avatar_url = patch.avatarUrl || profile.avatar_url || DEFAULT_AVATAR_URL;
  }

  const { data, error } = await supabase
    .from("users")
    .update(nextPatch)
    .eq("id", profile.id)
    .select(USER_PROFILE_COLUMNS)
    .maybeSingle<UserProfileRow>();

  if (error) {
    throw new Error(`Could not save profile: ${error.message}`);
  }

  if (!data) {
    throw new Error("Could not save profile.");
  }

  return data;
}

async function uploadAvatarDirect(file: Blob) {
  await assertPngBlobSize(file, 128);

  const { supabase, user } = await getAuthenticatedDirectProfileClient();
  const storagePath = `${user.id}/avatar.png`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Could not upload avatar: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
  return await updateProfileDirect({
    avatarUrl: `${data.publicUrl}?v=${Date.now()}`,
  });
}

async function getAuthenticatedDirectProfileClient() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("You must be signed in to edit your profile.");
  }

  return { supabase, user };
}

async function ensureDirectProfile(
  supabase: ReturnType<typeof createClient>,
  user: User,
) {
  const users = supabase.from("users");
  const { data: existingByAuth, error: existingByAuthError } = await users
    .select(USER_PROFILE_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle<UserProfileRow>();

  if (existingByAuthError) {
    throw existingByAuthError;
  }

  if (existingByAuth) {
    return await syncDirectProfileSeed(supabase, existingByAuth, user);
  }

  const { data: legacyById, error: legacyByIdError } = await users
    .select(USER_PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle<UserProfileRow>();

  if (legacyByIdError) {
    throw legacyByIdError;
  }

  if (legacyById) {
    return await syncDirectProfileSeed(supabase, legacyById, user);
  }

  const displayName = readOAuthDisplayName(user);
  const { data, error } = await users
    .insert({
      auth_user_id: user.id,
      email: user.email ?? null,
      username: normalizeUsernameForProfile(readMetadataString(user.user_metadata?.username)),
      display_name: displayName,
      avatar_url: DEFAULT_AVATAR_URL,
      configurations: {
        displayName: displayName ?? "",
      },
      updated_at: new Date().toISOString(),
    })
    .select(USER_PROFILE_COLUMNS)
    .maybeSingle<UserProfileRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Could not create your profile.");
  }

  return data;
}

async function syncDirectProfileSeed(
  supabase: ReturnType<typeof createClient>,
  profile: UserProfileRow,
  user: User,
) {
  const users = supabase.from("users");
  const configurations = readConfiguration(profile.configurations);
  const displayName = readOAuthDisplayName(user);
  const avatarUrl = getStoredAvatarUrl(profile.avatar_url, user);

  if (!configurations.displayName && displayName) {
    configurations.displayName = displayName;
  }

  const { data, error } = await users
    .update({
      auth_user_id: user.id,
      email: user.email ?? profile.email,
      display_name: profile.display_name || displayName,
      avatar_url: avatarUrl,
      configurations,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id)
    .select(USER_PROFILE_COLUMNS)
    .maybeSingle<UserProfileRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Could not load your profile.");
  }

  return data;
}

async function fetchProfileApi(pathname: string, init: RequestInit) {
  const remoteApiUrl = getRemoteApiUrl(pathname);
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  const user = session?.user ?? null;

  if (error) {
    throw error;
  }

  if (!session?.access_token || !user) {
    throw new Error("You must be signed in to edit your profile.");
  }

  const isExtension = Boolean(getExtensionRuntime()?.runtime?.id);
  const target = isExtension && remoteApiUrl ? remoteApiUrl : pathname;
  const response = await fetch(target, {
    ...init,
    headers: buildProfileRequestHeaders(
      init.headers,
      session.access_token,
      target !== pathname,
    ),
  });
  const payload = (await response.json()) as
    | { ok: true; data: ProfileApiResponse }
    | { ok: false; error: string };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Could not update your profile." : payload.error);
  }

  return payload.data;
}

type ProfileApiResponse = {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string;
};

function toUserProfileRow(profile: ProfileApiResponse): UserProfileRow {
  return {
    id: profile.id,
    auth_user_id: null,
    email: profile.email,
    username: profile.username,
    configurations: {
      displayName: profile.displayName,
    },
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl || DEFAULT_AVATAR_URL,
    updated_at: new Date().toISOString(),
  };
}

function getRemoteApiUrl(pathname: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) {
    return null;
  }

  return new URL(pathname, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).toString();
}

function buildProfileRequestHeaders(
  headers: HeadersInit | undefined,
  accessToken: string,
  includeAuthorization: boolean,
) {
  const nextHeaders = new Headers(headers);

  if (includeAuthorization) {
    nextHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  return nextHeaders;
}

async function resizePngToAvatar(file: File) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const size = 128;
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not resize image.");
    }

    context.clearRect(0, 0, size, size);
    const scale = Math.min(size / image.width, size / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const x = Math.round((size - width) / 2);
    const y = Math.round((size - height) / 2);
    context.drawImage(image, x, y, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not export resized PNG."));
          return;
        }

        resolve(blob);
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function loadImage(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;

  await image.decode();
  return image;
}

function readConfiguration(configurations: Json) {
  if (
    configurations &&
    typeof configurations === "object" &&
    !Array.isArray(configurations)
  ) {
    const displayName = configurations.displayName;
    return {
      ...configurations,
      displayName: typeof displayName === "string" ? displayName : "",
    };
  }

  return { displayName: "" };
}

function normalizeOptionalText(value: string) {
  return value.trim() || null;
}

function normalizeUsernameForProfile(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value ?? "")?.toLowerCase() ?? null;
  if (!normalized) {
    return null;
  }

  if (!/^[a-z0-9_-]{3,24}$/.test(normalized)) {
    throw new Error(
      "Username must be 3-24 characters and use only lowercase letters, numbers, underscores, or hyphens.",
    );
  }

  return normalized;
}

function readMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOAuthDisplayName(user: User) {
  return (
    readMetadataString(user.user_metadata?.full_name) ||
    readMetadataString(user.user_metadata?.display_name) ||
    readMetadataString(user.user_metadata?.name) ||
    null
  );
}

function readOAuthAvatarUrl(user: User) {
  return (
    readMetadataString(user.user_metadata?.avatar_url) ||
    readMetadataString(user.user_metadata?.picture) ||
    null
  );
}

function hasCustomAvatar(avatarUrl: string | null) {
  return Boolean(avatarUrl && avatarUrl !== DEFAULT_AVATAR_URL);
}

function getStoredAvatarUrl(avatarUrl: string | null, user: User) {
  if (!hasCustomAvatar(avatarUrl)) {
    return DEFAULT_AVATAR_URL;
  }

  return isOAuthAvatarUrl(avatarUrl, user) ? DEFAULT_AVATAR_URL : avatarUrl;
}

function isOAuthAvatarUrl(avatarUrl: string | null, user: User) {
  const oauthAvatarUrl = readOAuthAvatarUrl(user);
  return Boolean(
    avatarUrl &&
      oauthAvatarUrl &&
      stripCacheBuster(avatarUrl) === stripCacheBuster(oauthAvatarUrl),
  );
}

function stripCacheBuster(value: string) {
  return value.split("?")[0];
}

async function assertPngBlobSize(file: Blob, expectedSize: number) {
  const arrayBuffer = await file.arrayBuffer();
  const view = new DataView(arrayBuffer);
  const signature = new Uint8Array(arrayBuffer.slice(0, 8));
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = pngSignature.every((byte, index) => signature[index] === byte);

  if (!isPng || arrayBuffer.byteLength < 24) {
    throw new Error("Avatar must be a valid PNG image.");
  }

  const width = view.getUint32(16);
  const height = view.getUint32(20);

  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(`Avatar PNG must be exactly ${expectedSize}x${expectedSize} pixels.`);
  }
}

function ProfileBackground() {
  return (
    <div className="app-background" aria-hidden="true">
      <div className="sky" />
      <div className="clouds">
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
      </div>
      <div className="ground" />
    </div>
  );
}

function ProfileTitleIcon() {
  return (
    <svg className="xp-title-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="#6ebe44" stroke="#3d8e22" strokeWidth="1" />
      <circle cx="6" cy="7" r="1.2" fill="#1a2a44" />
      <circle cx="10" cy="7" r="1.2" fill="#1a2a44" />
      <path d="M5.8 10.4c1.3 1 3.1 1 4.4 0" stroke="#2d5018" strokeLinecap="round" />
    </svg>
  );
}
