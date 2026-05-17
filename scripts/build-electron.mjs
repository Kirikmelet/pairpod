import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const staticExportExcludedRoutes = [
  path.join(root, "app", "api"),
  path.join(root, "app", "auth"),
  path.join(root, "app", "profile"),
  path.join(root, "proxy.ts"),
];

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const executable =
      process.platform === "win32" && (command === "npm" || command === "npx")
        ? `${command}.cmd`
        : command;
    const child = spawn(executable, args, {
      cwd: root,
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
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

const stashedRoutes = [];
const buildStashDir = await mkdtemp(path.join(os.tmpdir(), "uncommonhacks-electron-"));
try {
  for (const source of staticExportExcludedRoutes) {
    const stashedRoute = await stashRoute(source, buildStashDir);
    if (stashedRoute) {
      stashedRoutes.push(stashedRoute);
    }
  }

  await rm(path.join(root, ".next", "dev", "types"), { recursive: true, force: true });
  await rm(path.join(root, ".next", "types"), { recursive: true, force: true });
  await run("npx", ["next", "build", "--webpack"], { BUILD_ELECTRON: "1" });
} finally {
  while (stashedRoutes.length > 0) {
    await restoreRoute(stashedRoutes.pop());
  }
  await rm(buildStashDir, { recursive: true, force: true });
}

await rewriteRootRelativePaths(outDir);
console.log("Prepared Electron static export in out");

async function stashRoute(source, stashDir) {
  try {
    const stash = path.join(stashDir, path.relative(root, source));
    await mkdir(path.dirname(stash), { recursive: true });
    await cp(source, stash, { recursive: true });
    await rm(source, { recursive: true, force: true });
    return { source, stash };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function restoreRoute({ source, stash }) {
  await rm(source, { recursive: true, force: true });
  await cp(stash, source, { recursive: true });
}

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
