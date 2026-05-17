const SUPABASE_URL = "https://xgfgqzveuyeceupfaebh.supabase.co";
const SUPABASE_KEY = "sb_publishable_0Hgx9YihoeNsaIGv7ZWUww_zKZsbDvM";
const STORAGE_KEY = "sb-xgfgqzveuyeceupfaebh-auth-token";
const SFX_BASE_URL = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/sfx`;
const runtime = globalThis.chrome ?? globalThis.browser;

const windowBody = document.getElementById("windowBody");
const signInTab = document.getElementById("tabIn");
const registerTab = document.getElementById("tabUp");
const submitButton = document.getElementById("submitBtn");
const authForm = document.getElementById("authForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const usernameInput = document.getElementById("usernameInput");
const loggedInView = document.getElementById("loggedInView");
const welcomeMsg = document.getElementById("welcomeMsg");
const userEmailEl = document.getElementById("userEmail");
const logoutBtn = document.getElementById("logoutBtn");
const googleBtn = document.getElementById("googleBtn");
const homeBtn = document.getElementById("homeBtn");

let currentMode = "signin";
let didPrimeSfx = false;

const SFX = {
  error: "erro.mp3",
  goodbye: "Goodbye.mp3",
  im: "IM.mp3",
  welcome: "Welcome.mp3",
};

const audioCache = new Map();

function getSfxAudio(name) {
  const fileName = SFX[name];
  if (!fileName) return null;
  const cached = audioCache.get(name);
  if (cached) return cached;
  const audio = new Audio(`${SFX_BASE_URL}/${encodeURIComponent(fileName)}`);
  audio.preload = "auto";
  audioCache.set(name, audio);
  return audio;
}

function primeSfx() {
  if (didPrimeSfx) return;
  didPrimeSfx = true;
  for (const name of Object.keys(SFX)) {
    try {
      const audio = getSfxAudio(name);
      if (!audio) continue;
      audio.muted = true;
      audio.volume = 0;
      void audio.play()
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

async function playSfx(name) {
  try {
    const audio = getSfxAudio(name);
    if (!audio) return;
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    await audio.play();
  } catch {}
}

async function playSfxAndWait(name, delayMs = 650) {
  await playSfx(name);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

window.addEventListener("pointerdown", primeSfx, { passive: true });
window.addEventListener("keydown", primeSfx);

function supabaseHeaders(accessToken) {
  return {
    apikey: SUPABASE_KEY,
    authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_KEY}`,
    "content-type": "application/json",
  };
}

function showToast(message, type = "info") {
  if (type === "error") {
    playSfx("error");
  }
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function setMode(mode) {
  currentMode = mode;
  const isRegistering = mode === "register";
  windowBody.classList.toggle("signup-mode", isRegistering);
  signInTab.classList.toggle("active", !isRegistering);
  registerTab.classList.toggle("active", isRegistering);
  signInTab.setAttribute("aria-selected", String(!isRegistering));
  registerTab.setAttribute("aria-selected", String(isRegistering));
  submitButton.textContent = isRegistering ? "Create Account" : "Sign In";
}

async function storageGet(key) {
  const storage = runtime?.storage?.local;
  if (!storage) return null;
  return await new Promise((resolve, reject) => {
    const maybePromise = storage.get(key, (items) => {
      const message = runtime.runtime?.lastError?.message;
      if (message) reject(new Error(message));
      else resolve(items?.[key] ?? null);
    });
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then((items) => resolve(items?.[key] ?? null), reject);
    }
  });
}

async function storageSet(items) {
  const storage = runtime?.storage?.local;
  if (!storage) return;
  await new Promise((resolve, reject) => {
    const maybePromise = storage.set(items, () => {
      const message = runtime.runtime?.lastError?.message;
      if (message) reject(new Error(message));
      else resolve();
    });
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}

async function storageRemove(key) {
  const storage = runtime?.storage?.local;
  if (!storage) return;
  await new Promise((resolve, reject) => {
    const maybePromise = storage.remove(key, () => {
      const message = runtime.runtime?.lastError?.message;
      if (message) reject(new Error(message));
      else resolve();
    });
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}

function normalizeSession(session) {
  const expiresIn = Number(session.expires_in ?? 3600);
  return {
    ...session,
    expires_at: session.expires_at ?? Math.round(Date.now() / 1000) + expiresIn,
    expires_in: expiresIn,
  };
}

async function saveSession(session) {
  if (!session?.access_token) {
    throw new Error("Supabase did not return a session.");
  }
  await storageSet({ [STORAGE_KEY]: JSON.stringify(normalizeSession(session)) });
}

async function loadSession() {
  const raw = await storageGet(STORAGE_KEY);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function clearSession() {
  await storageRemove(STORAGE_KEY);
}

function showLoggedIn(email, username) {
  document.body.classList.add("is-logged-in");
  loggedInView.classList.add("visible");
  welcomeMsg.textContent = username ? `Welcome, ${username}!` : "Welcome back!";
  userEmailEl.textContent = email || "";
}

function showLoggedOut() {
  document.body.classList.remove("is-logged-in");
  loggedInView.classList.remove("visible");
}

function goHome() {
  window.location.href = runtime?.runtime?.getURL?.("popup.html") ?? "popup.html";
}

async function readSupabaseJson(response, fallbackMessage) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error_description ?? data?.msg ?? data?.message ?? fallbackMessage);
  }
  return data;
}

async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return await readSupabaseJson(response, "Sign in failed");
}

async function signUp(email, password, username) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({
      email,
      password,
      data: {
        username: username || null,
      },
    }),
  });
  return await readSupabaseJson(response, "Registration failed");
}

async function upsertUserProfile(session, username) {
  const user = session.user;
  if (!user?.id) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(session.access_token),
      prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: user.id,
      auth_user_id: user.id,
      email: user.email ?? null,
      username: username || user.user_metadata?.username || null,
      configurations: {
        displayName: user.user_metadata?.full_name || user.user_metadata?.name || null,
      },
    }),
  });
  if (!response.ok) {
    console.warn("Profile upsert failed", await response.text().catch(() => ""));
  }
}

async function restoreSession() {
  const session = await loadSession();
  if (!session?.user) return;
  showLoggedIn(
    session.user.email || "",
    session.user.user_metadata?.username ||
      session.user.user_metadata?.full_name ||
      session.user.email ||
      "",
  );
}

signInTab?.addEventListener("click", () => setMode("signin"));
registerTab?.addEventListener("click", () => setMode("register"));

homeBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  goHome();
});

logoutBtn?.addEventListener("click", async () => {
  primeSfx();
  await playSfxAndWait("goodbye", 1200);
  await clearSession();
  showLoggedOut();
  showToast("Signed out", "info");
});

googleBtn?.addEventListener("click", async (event) => {
  event.preventDefault();
  primeSfx();
  if (!runtime?.runtime?.sendMessage) {
    showToast("Extension Google auth is unavailable.", "error");
    return;
  }
  submitButton.disabled = true;
  try {
    const redirectTo = runtime.identity?.getRedirectURL?.("auth/callback");
    if (!redirectTo) throw new Error("The extension could not create an auth redirect URL.");
    const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
    authUrl.searchParams.set("provider", "google");
    authUrl.searchParams.set("redirect_to", redirectTo);
    authUrl.searchParams.set("skip_http_redirect", "true");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    const response = await new Promise((resolve, reject) => {
      const maybePromise = runtime.runtime.sendMessage({
        authUrl: authUrl.toString(),
        storageKey: STORAGE_KEY,
        supabaseKey: SUPABASE_KEY,
        supabaseUrl: SUPABASE_URL,
        type: "peerpod.googleAuth",
      }, (result) => {
        const message = runtime.runtime?.lastError?.message;
        if (message) reject(new Error(message));
        else resolve(result);
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve, reject);
      }
    });
    if (!response?.ok) throw new Error(response?.error || "Google sign-in failed.");
    await playSfxAndWait("welcome");
    showToast("Signed in with Google", "success");
    await restoreSession();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Google sign-in failed", "error");
  } finally {
    submitButton.disabled = false;
  }
});

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  primeSfx();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const username = usernameInput.value.trim();
  if (!email || !password) {
    showToast("Email and password are required", "error");
    return;
  }
  submitButton.classList.add("loading");
  submitButton.disabled = true;
  try {
    const session = currentMode === "register"
      ? await signUp(email, password, username)
      : await signIn(email, password);
    if (!session.access_token) {
      showToast("Check your email to confirm your account, then sign in.", "success");
      setMode("signin");
      return;
    }
    await saveSession(session);
    await upsertUserProfile(session, username);
    await playSfxAndWait("welcome");
    showToast(currentMode === "register" ? "Account created" : "Signed in", "success");
    showLoggedIn(session.user?.email || email, username || session.user?.email || "");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Sign in failed", "error");
  } finally {
    submitButton.classList.remove("loading");
    submitButton.disabled = false;
  }
});

void restoreSession();
