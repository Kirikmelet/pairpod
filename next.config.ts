import type { NextConfig } from "next";

const isExtensionBuild = process.env.BUILD_EXTENSION === "1";

const nextConfig: NextConfig = {
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
