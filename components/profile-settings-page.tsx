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
  clothing_url: string | null;
  updated_at: string;
};

type Character3dConfig = {
  body: string;
  accent: string;
  head: string;
  style: "pod" | "runner" | "bot";
  clothingImageUrl?: string | null;
};

type ProfileConfiguration = {
  displayName: string;
  character3d: Character3dConfig;
};

const DEFAULT_CHARACTER_3D: Character3dConfig = {
  body: "#6ebe44",
  accent: "#2d90ff",
  head: "#f7ffe8",
  style: "pod",
};
const DEFAULT_AVATAR_URL =
  "https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png";
const AVATAR_BUCKET = "profile_pictures";
const CLOTHING_BUCKET = "character_clothing";
const USER_PROFILE_COLUMNS =
  "id,auth_user_id,email,username,configurations,display_name,avatar_url,clothing_url,updated_at";

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
  const [characterBody, setCharacterBody] = useState(DEFAULT_CHARACTER_3D.body);
  const [characterAccent, setCharacterAccent] = useState(DEFAULT_CHARACTER_3D.accent);
  const [characterHead, setCharacterHead] = useState(DEFAULT_CHARACTER_3D.head);
  const [characterStyle, setCharacterStyle] = useState<Character3dConfig["style"]>(DEFAULT_CHARACTER_3D.style);
  const [characterClothingImageUrl, setCharacterClothingImageUrl] = useState<string | null>(null);
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
    setCharacterBody(configuration.character3d.body);
    setCharacterAccent(configuration.character3d.accent);
    setCharacterHead(configuration.character3d.head);
    setCharacterStyle(configuration.character3d.style);
    setCharacterClothingImageUrl(
      nextProfile.clothing_url ?? configuration.character3d.clothingImageUrl ?? null,
    );
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

  const handleCharacterSave = async () => {
    if (!profile) {
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const nextProfile = await updateProfile({
        character3d: {
          body: characterBody,
          accent: characterAccent,
          head: characterHead,
          style: characterStyle,
        },
      });
      hydrateForm(nextProfile);
      setStatus("3D character updated.");
    } catch (avatarError) {
      setError(
        avatarError instanceof Error
          ? avatarError.message
          : "Could not save 3D character.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClothingChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !profile) {
      return;
    }

    if (file.type !== "image/png") {
      setError("Please upload a PNG file for clothing.");
      return;
    }

    setUploading(true);
    setError(null);
    setStatus(null);

    try {
      const resized = await resizePngToSquare(file, 256);
      const clothingUrl = await uploadCharacterClothing(resized);
      const nextProfile = await updateProfile({
        clothingUrl,
        character3d: {
          body: characterBody,
          accent: characterAccent,
          head: characterHead,
          style: characterStyle,
        },
      });
      hydrateForm(nextProfile);
      setStatus("3D clothing updated.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Could not upload clothing.",
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

            <div className="profile-editor-grid">
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

              <section className="avatar-creator" aria-label="Avatar creator">
                <header>
                  <p className="app-eyebrow">3D character</p>
                  <h2>PeerScape look</h2>
                </header>
                <div className="avatar-creator__preview">
                  <CharacterPreview
                    body={characterBody}
                    accent={characterAccent}
                    head={characterHead}
                    style={characterStyle}
                    clothingImageUrl={characterClothingImageUrl}
                  />
                </div>
                <div className="avatar-creator__controls">
                  <label>
                    <span>Body</span>
                    <input
                      type="color"
                      value={characterBody}
                      onChange={(event) => setCharacterBody(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Accent</span>
                    <input
                      type="color"
                      value={characterAccent}
                      onChange={(event) => setCharacterAccent(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Head</span>
                    <input
                      type="color"
                      value={characterHead}
                      onChange={(event) => setCharacterHead(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Shape</span>
                    <select
                      value={characterStyle}
                      onChange={(event) => setCharacterStyle(event.target.value as Character3dConfig["style"])}
                    >
                      <option value="pod">Pod</option>
                      <option value="runner">Runner</option>
                      <option value="bot">Bot</option>
                    </select>
                  </label>
                  {canUseFilePicker ? (
                    <label>
                      <span>Clothing PNG</span>
                      <input
                        type="file"
                        accept="image/png"
                        onChange={(event) => void handleClothingChange(event)}
                        disabled={!profile || uploading || saving}
                      />
                    </label>
                  ) : (
                    <label>
                      <span>Clothing PNG</span>
                      <a
                        className="profile-upload-link"
                        href={nav.fullProfileHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open editor
                      </a>
                    </label>
                  )}
                </div>
                <button
                  className="profile-save-button avatar-creator__save"
                  type="button"
                  disabled={!profile || uploading || saving}
                  onClick={() => void handleCharacterSave()}
                >
                  {saving ? "Saving..." : "Save 3D character"}
                </button>
              </section>
            </div>
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

function CharacterPreview({
  body,
  accent,
  head,
  style,
  clothingImageUrl,
}: Character3dConfig) {
  const clothingStyle = clothingImageUrl
    ? {
        backgroundColor: body,
        backgroundImage: `url("${clothingImageUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundColor: body };

  return (
    <div className={`character-preview character-preview--${style}`}>
      <span className="character-preview__antenna" style={{ backgroundColor: accent }} />
      <span className="character-preview__head" style={{ backgroundColor: head }}>
        <i style={{ backgroundColor: accent }} />
        <i style={{ backgroundColor: accent }} />
      </span>
      <span className="character-preview__body" style={clothingStyle} />
      <span className="character-preview__ring" style={{ borderColor: accent }} />
    </div>
  );
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
  clothingUrl?: string | null;
  character3d?: Character3dConfig;
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

async function uploadCharacterClothing(file: Blob) {
  await assertPngBlobSize(file, 256, "Clothing");

  const { supabase, user } = await getAuthenticatedDirectProfileClient();
  const storagePath = `${user.id}/clothing.png`;
  const { error: uploadError } = await supabase.storage
    .from(CLOTHING_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Could not upload clothing: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(CLOTHING_BUCKET).getPublicUrl(storagePath);
  return `${data.publicUrl}?v=${Date.now()}`;
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
  clothingUrl?: string | null;
  character3d?: Character3dConfig;
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

  if (Object.prototype.hasOwnProperty.call(patch, "clothingUrl")) {
    nextPatch.clothing_url = normalizeImageUrl(patch.clothingUrl) ?? null;
    nextConfiguration.character3d = {
      ...nextConfiguration.character3d,
      clothingImageUrl: null,
    };
    nextPatch.configurations = nextConfiguration;
  }

  if (patch.character3d) {
    nextConfiguration.character3d = {
      ...normalizeCharacter3d(patch.character3d),
      clothingImageUrl: null,
    };
    nextPatch.configurations = nextConfiguration;
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
  await assertPngBlobSize(file, 128, "Avatar");

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
      clothing_url: null,
      configurations: {
        displayName: displayName ?? "",
        character3d: DEFAULT_CHARACTER_3D,
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
      clothing_url: profile.clothing_url ?? configurations.character3d.clothingImageUrl ?? null,
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
  clothingUrl: string | null;
  character3d?: Character3dConfig;
};

function toUserProfileRow(profile: ProfileApiResponse): UserProfileRow {
  return {
    id: profile.id,
    auth_user_id: null,
    email: profile.email,
    username: profile.username,
    configurations: {
      displayName: profile.displayName,
      character3d: profile.character3d ?? DEFAULT_CHARACTER_3D,
    },
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl || DEFAULT_AVATAR_URL,
    clothing_url: profile.clothingUrl ?? null,
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

type GeneratedAvatarOptions = {
  body: string;
  accent: string;
  face: "smile" | "focus" | "star";
};

async function createGeneratedAvatarBlob(options: GeneratedAvatarOptions) {
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create avatar.");
  }

  context.clearRect(0, 0, size, size);
  const background = context.createLinearGradient(0, 0, size, size);
  background.addColorStop(0, "#eff8ff");
  background.addColorStop(1, "#b9dcff");
  context.fillStyle = background;
  roundedRect(context, 0, 0, size, size, 26);
  context.fill();

  context.save();
  context.translate(64, 68);
  context.fillStyle = options.body;
  context.shadowColor = "rgba(0, 60, 140, 0.28)";
  context.shadowBlur = 10;
  context.beginPath();
  context.ellipse(0, 8, 39, 43, 0, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  context.fillStyle = "rgba(255,255,255,0.48)";
  context.beginPath();
  context.ellipse(-15, -9, 12, 17, -0.7, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = options.accent;
  context.beginPath();
  context.ellipse(17, -47, 10, 20, 0.65, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#2d5018";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(0, -36);
  context.quadraticCurveTo(3, -49, 15, -56);
  context.stroke();

  drawAvatarFace(context, options.face);
  context.restore();

  return await canvasToPngBlob(canvas);
}

function drawAvatarFace(
  context: CanvasRenderingContext2D,
  face: GeneratedAvatarOptions["face"],
) {
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(-14, -2, 9, 0, Math.PI * 2);
  context.arc(14, -2, 9, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#182746";
  context.beginPath();
  if (face === "star") {
    drawStar(context, -14, -2, 5, 9, 4);
    drawStar(context, 14, -2, 5, 9, 4);
  } else {
    context.arc(-14, face === "focus" ? -1 : -2, 4, 0, Math.PI * 2);
    context.arc(14, face === "focus" ? -1 : -2, 4, 0, Math.PI * 2);
  }
  context.fill();

  context.strokeStyle = "#2d5018";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.beginPath();
  if (face === "focus") {
    context.moveTo(-16, 23);
    context.lineTo(16, 23);
  } else {
    context.arc(0, 16, 17, 0.18 * Math.PI, 0.82 * Math.PI);
  }
  context.stroke();
}

function drawStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  points: number,
  outerRadius: number,
  innerRadius: number,
) {
  context.moveTo(x, y - outerRadius);
  for (let i = 1; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  context.closePath();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

async function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not export avatar PNG."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not preview avatar."));
    reader.readAsDataURL(blob);
  });
}

async function resizePngToAvatar(file: File) {
  return await resizePngToSquare(file, 128);
}

async function resizePngToSquare(file: File, size: number) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
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

    return await canvasToPngBlob(canvas);
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

function readConfiguration(configurations: Json): ProfileConfiguration {
  if (
    configurations &&
    typeof configurations === "object" &&
    !Array.isArray(configurations)
  ) {
    const displayName = configurations.displayName;
    const character3d = normalizeCharacter3d(configurations.character3d);
    return {
      ...configurations,
      displayName: typeof displayName === "string" ? displayName : "",
      character3d,
    };
  }

  return { displayName: "", character3d: DEFAULT_CHARACTER_3D };
}

function normalizeCharacter3d(value: unknown): Character3dConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_CHARACTER_3D;
  }

  const candidate = value as Partial<Character3dConfig>;
  return {
    body: normalizeColor(candidate.body) ?? DEFAULT_CHARACTER_3D.body,
    accent: normalizeColor(candidate.accent) ?? DEFAULT_CHARACTER_3D.accent,
    head: normalizeColor(candidate.head) ?? DEFAULT_CHARACTER_3D.head,
    style: candidate.style === "runner" || candidate.style === "bot" ? candidate.style : "pod",
    clothingImageUrl: normalizeImageUrl(candidate.clothingImageUrl),
  };
}

function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function normalizeImageUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
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

async function assertPngBlobSize(file: Blob, expectedSize: number, label = "PNG") {
  const arrayBuffer = await file.arrayBuffer();
  const view = new DataView(arrayBuffer);
  const signature = new Uint8Array(arrayBuffer.slice(0, 8));
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = pngSignature.every((byte, index) => signature[index] === byte);

  if (!isPng || arrayBuffer.byteLength < 24) {
    throw new Error(`${label} must be a valid PNG image.`);
  }

  const width = view.getUint32(16);
  const height = view.getUint32(20);

  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(`${label} PNG must be exactly ${expectedSize}x${expectedSize} pixels.`);
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
