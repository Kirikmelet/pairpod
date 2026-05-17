import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal, requireSupabaseEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "extension");
const publicDir = path.join(root, "public");
const manifestPath = path.join(extensionDir, "manifest.json");

const env = await loadEnvLocal(root);
const { url: supabaseUrl, key: supabaseKey } = requireSupabaseEnv(env);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const supabaseOrigin = new URL(supabaseUrl).origin;
const siteOrigin = new URL(env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin;
const hostPermissions = [`${supabaseOrigin}/*`, `${siteOrigin}/*`];

manifest.host_permissions = Array.from(new Set(hostPermissions));
manifest.permissions = Array.from(
  new Set([...(manifest.permissions ?? []), "identity", "storage"]),
);
manifest.action = {
  ...(manifest.action ?? {}),
  default_popup: "login.html",
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeExtensionLoginAssets();
await copyFile(path.join(root, "app", "globals.css"), path.join(extensionDir, "globals.css"));
await copyFile(path.join(root, "app", "login.html"), path.join(publicDir, "login.html"));
await copyFile(path.join(root, "app", "globals.css"), path.join(publicDir, "globals.css"));

console.log(`Manifest host_permissions: ${manifest.host_permissions.join(", ")}`);
console.log("Copied static login assets to extension and public login outputs");

async function writeExtensionLoginAssets() {
  const sourceHtml = await readFile(path.join(root, "app", "login.html"), "utf8");
  const styleMatch = sourceHtml.match(/<style>\s*([\s\S]*?)\s*<\/style>/);

  if (!styleMatch?.[1]) {
    throw new Error("Could not extract inline style from app/login.html.");
  }

  const extensionHtml = sourceHtml
    .replace(
      /<style>\s*[\s\S]*?\s*<\/style>/,
      '<link rel="stylesheet" href="./login.css" />',
    )
    .replace(
      /<script>\s*[\s\S]*?\s*<\/script>\s*<\/body>/,
      '<script src="./login.js"></script>\n  </body>',
    );

  await writeFile(path.join(extensionDir, "login.html"), extensionHtml);
  await writeFile(
    path.join(extensionDir, "login.css"),
    `${styleMatch[1].trim()}\n${buildExtensionLoginCss()}`,
  );
  await writeFile(path.join(extensionDir, "login.js"), buildExtensionLoginScript());
}

function buildExtensionLoginScript() {
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

  return `const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
const SUPABASE_KEY = ${JSON.stringify(supabaseKey)};
const STORAGE_KEY = ${JSON.stringify(storageKey)};
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

function supabaseHeaders(accessToken) {
  return {
    apikey: SUPABASE_KEY,
    authorization: accessToken ? \`Bearer \${accessToken}\` : \`Bearer \${SUPABASE_KEY}\`,
    "content-type": "application/json",
  };
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = \`toast toast--\${type}\`;
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
  welcomeMsg.textContent = username ? \`Welcome, \${username}!\` : "Welcome back!";
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
  const response = await fetch(\`\${SUPABASE_URL}/auth/v1/token?grant_type=password\`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return await readSupabaseJson(response, "Sign in failed");
}

async function signUp(email, password, username) {
  const response = await fetch(\`\${SUPABASE_URL}/auth/v1/signup\`, {
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
  const response = await fetch(\`\${SUPABASE_URL}/rest/v1/users\`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(session.access_token),
      prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: user.id,
      email: user.email ?? null,
      username: username || user.user_metadata?.username || null,
      configurations: {
        displayName: user.user_metadata?.full_name || user.user_metadata?.name || null,
      },
      avatar_url: user.user_metadata?.avatar_url || undefined,
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
  await clearSession();
  showLoggedOut();
  showToast("Signed out", "info");
});

googleBtn?.addEventListener("click", async (event) => {
  event.preventDefault();
  if (!runtime?.runtime?.sendMessage) {
    showToast("Extension Google auth is unavailable.", "error");
    return;
  }
  submitButton.disabled = true;
  try {
    const redirectTo = runtime.identity?.getRedirectURL?.("auth/callback");
    if (!redirectTo) throw new Error("The extension could not create an auth redirect URL.");
    const authUrl = new URL(\`\${SUPABASE_URL}/auth/v1/authorize\`);
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
`;
}

function buildExtensionLoginCss() {
  return `
html,
body {
  width: 380px;
  min-width: 380px;
  max-width: 380px;
  height: 560px;
  min-height: 560px;
  max-height: 560px;
  margin: 0;
  overflow: hidden;
}

.page-layout {
  width: 380px;
  min-width: 380px;
  max-width: 380px;
  height: 560px;
  min-height: 560px;
  max-height: 560px;
  padding: 8px;
  position: relative;
  inset: auto;
}

.app-window {
  width: 100%;
  max-width: 100%;
}

.xp-window-body {
  max-height: 516px;
  overflow: auto;
  padding: 18px;
}

.clouds,
.sky,
.hills-svg,
.ground,
.bubbles {
  position: fixed;
}
`;
}
