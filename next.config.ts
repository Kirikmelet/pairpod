import type { NextConfig } from "next";
import path from "node:path";

const isExtensionBuild = process.env.BUILD_EXTENSION === "1";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  ...(isExtensionBuild
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
