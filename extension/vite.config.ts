import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "extension");
const env = loadEnvLocal(root);
const { url: supabaseUrl, key: supabaseKey } = requireSupabaseEnv(env);

const stripNextClientDirective: Plugin = {
  name: "strip-next-client-directive",
  transform(code, id) {
    if (!/[jt]sx$/.test(id)) {
      return null;
    }

    return code.replace(/^["']use client["'];?\s*/, "");
  },
};

export default defineConfig({
  root,
  plugins: [stripNextClientDirective],
  resolve: {
    alias: {
      "@": root,
      "next/navigation": path.join(
        extensionDir,
        "src",
        "next-navigation-shim.ts",
      ),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":
      JSON.stringify(supabaseKey),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    ),
    "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(
      env.NEXT_PUBLIC_SITE_URL ?? "",
    ),
    "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL ?? ""),
  },
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    minify: process.env.NODE_ENV === "production",
    outDir: extensionDir,
    target: ["chrome109", "firefox128"],
    lib: {
      entry: path.join(extensionDir, "src", "popup.tsx"),
      formats: ["iife"],
      name: "PeerPodPopup",
    },
    rollupOptions: {
      output: {
        entryFileNames: "popup.js",
        assetFileNames: (assetInfo) =>
          assetInfo.names?.some((name) => name.endsWith(".css"))
            ? "popup.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});

function loadEnvLocal(projectRoot: string): Record<string, string> {
  const envPath = path.join(projectRoot, ".env.local");
  const content = readFileSync(envPath, "utf8");
  const parsedEnv: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    parsedEnv[key] = value;
  }

  return parsedEnv;
}

function requireSupabaseEnv(envValues: Record<string, string>) {
  const url = envValues.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    envValues.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    envValues.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      ".env.local must define NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, key };
}
