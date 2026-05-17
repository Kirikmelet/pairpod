import type { NextConfig } from "next";
import path from "node:path";

const isExtensionBuild = process.env.BUILD_EXTENSION === "1";
const isElectronBuild = process.env.BUILD_ELECTRON === "1";
const isStaticShellBuild = isExtensionBuild || isElectronBuild;

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  ...(isStaticShellBuild
    ? {
        output: "export",
        trailingSlash: true,
        assetPrefix: "./",
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default nextConfig;
