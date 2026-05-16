import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { loadEnvLocal, requireSupabaseEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "extension");
const entry = path.join(extensionDir, "src", "popup.tsx");
const cssInput = path.join(extensionDir, "src", "popup.css");
const outfile = path.join(extensionDir, "popup.js");
const cssOutfile = path.join(extensionDir, "popup.css");
const manifestPath = path.join(extensionDir, "manifest.json");

const env = await loadEnvLocal(root);
const { url: supabaseUrl, key: supabaseKey } = requireSupabaseEnv(env);

const cssSource = await readFile(cssInput, "utf8");
const cssResult = await postcss([tailwindcss()]).process(cssSource, {
  from: cssInput,
  to: cssOutfile,
});
await writeFile(cssOutfile, cssResult.css);

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome109", "firefox128"],
  jsx: "automatic",
  minify: process.env.NODE_ENV === "production",
  alias: {
    "@": root,
  },
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
  },
  logLevel: "info",
});

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const supabaseOrigin = new URL(supabaseUrl).origin;
const hostPermission = `${supabaseOrigin}/*`;

manifest.host_permissions = [hostPermission];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Bundled ${path.relative(root, entry)} -> ${path.relative(root, outfile)}`);
console.log(`Compiled ${path.relative(root, cssInput)} -> ${path.relative(root, cssOutfile)}`);
console.log(`Manifest host_permissions: ${hostPermission}`);

