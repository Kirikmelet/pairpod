// @ts-check
const path = require("node:path");

const isExtensionBuild = process.env.BUILD_EXTENSION === "1";
const isElectronBuild = process.env.BUILD_ELECTRON === "1";
const isStaticShellBuild = isExtensionBuild || isElectronBuild;

/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = nextConfig;
