import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal, requireSupabaseEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "extension");
const manifestPath = path.join(extensionDir, "manifest.json");

const env = await loadEnvLocal(root);
const { url: supabaseUrl } = requireSupabaseEnv(env);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const supabaseOrigin = new URL(supabaseUrl).origin;
const siteOrigin = new URL(env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin;
const hostPermissions = [`${supabaseOrigin}/*`, `${siteOrigin}/*`];

manifest.host_permissions = Array.from(new Set(hostPermissions));
manifest.permissions = Array.from(
  new Set([...(manifest.permissions ?? []), "identity", "storage"]),
);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeExtensionLoginAssets();
await copyFile(path.join(root, "app", "globals.css"), path.join(extensionDir, "globals.css"));

console.log(`Manifest host_permissions: ${manifest.host_permissions.join(", ")}`);
console.log("Copied static login assets to extension/login.html, extension/login.js, and extension/globals.css");

async function writeExtensionLoginAssets() {
  const sourceHtml = await readFile(path.join(root, "app", "login.html"), "utf8");
  const scriptMatch = sourceHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);

  if (!scriptMatch?.[1]) {
    throw new Error("Could not extract inline script from app/login.html.");
  }

  const extensionHtml = sourceHtml.replace(
    /<script>\s*[\s\S]*?\s*<\/script>\s*<\/body>/,
    '<script src="./login.js"></script>\n  </body>',
  );

  await writeFile(path.join(extensionDir, "login.html"), extensionHtml);
  await writeFile(path.join(extensionDir, "login.js"), `${scriptMatch[1].trim()}\n`);
}
