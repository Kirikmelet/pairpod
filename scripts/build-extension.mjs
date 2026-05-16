import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const appDir = path.join(root, "extension", "app");

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

await run("node", ["scripts/bundle-extension-popup.mjs"]);
await run("npm", ["run", "build"], { BUILD_EXTENSION: "1" });
await rm(appDir, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });
await cp(outDir, appDir, { recursive: true });
await rewriteRootRelativePaths(appDir);
console.log(`Copied static export to ${path.relative(root, appDir)}`);

async function rewriteRootRelativePaths(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await rewriteRootRelativePaths(fullPath);
      continue;
    }

    if (!/\.(?:html|js|txt)$/.test(entry.name)) {
      continue;
    }

    const original = await readFile(fullPath, "utf8");
    const updated = original
      .replace(/(\s(?:src|href)=)"\/(?!\/)/g, '$1"./')
      .replace(/"src":"\/(?!\/)/g, '"src":"./')
      .replace(/"href":"\/_next/g, '"href":"./_next');

    if (updated !== original) {
      await writeFile(fullPath, updated);
    }
  }
}
