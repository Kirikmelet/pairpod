import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal, requireSupabaseEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "extension");
const publicDir = path.join(root, "public");
const manifestPath = path.join(extensionDir, "manifest.json");

const env = await loadEnvLocal(root);
const { url: supabaseUrl } = requireSupabaseEnv(env);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const supabaseOrigin = new URL(supabaseUrl).origin;
const supabaseRealtimeOrigin = supabaseOrigin.replace(/^https:/, "wss:");
const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
const hostPermissions = [`${supabaseOrigin}/*`];
const connectSrc = ["'self'", supabaseOrigin, supabaseRealtimeOrigin];
const mediaSrc = ["'self'", supabaseOrigin];

if (siteUrl) {
  const siteOrigin = new URL(siteUrl).origin;
  hostPermissions.push(`${siteOrigin}/*`);
  connectSrc.push(siteOrigin);
}

manifest.host_permissions = Array.from(new Set(hostPermissions));
manifest.permissions = Array.from(
  new Set([...(manifest.permissions ?? []), "identity", "storage"]),
);
manifest.action = {
  ...(manifest.action ?? {}),
  default_popup: "popup.html",
};
manifest.content_security_policy = {
  ...(manifest.content_security_policy ?? {}),
  extension_pages: [
    "script-src 'self'",
    "object-src 'self'",
    `connect-src ${Array.from(new Set(connectSrc)).join(" ")}`,
    `media-src ${Array.from(new Set(mediaSrc)).join(" ")}`,
  ].join("; "),
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await copyFile(path.join(root, "app", "globals.css"), path.join(extensionDir, "globals.css"));
await copyFile(path.join(root, "app", "login.html"), path.join(publicDir, "login.html"));
await copyFile(path.join(root, "app", "globals.css"), path.join(publicDir, "globals.css"));

console.log(`Manifest host_permissions: ${manifest.host_permissions.join(", ")}`);
console.log("Extension popup points to popup.html");
