import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal, requireSupabaseEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "extension", "manifest.json");

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

console.log(`Manifest host_permissions: ${manifest.host_permissions.join(", ")}`);
