/** @type {import('next').NextConfig} */
// Dev 500s: ENOENT `_buildManifest.js.tmp.*` or `Cannot find module './NNN.js'` → stale
// `.next`. Stop all dev servers, run `npm run clean`, then `npm run dev` once (or
// `npm run dev:clean`). Only one `next dev` for this folder.
// Do not run `next build` in another terminal while `next dev` is running — both
// write `.next` and corrupt each other’s output.
const nextConfig = {
  // Avoid pulling sheetjs through the server bundler graph incorrectly.
  serverExternalPackages: ["xlsx", "puppeteer", "archiver"],
  // Next 15 enables this by default; it can break dev (React Client Manifest /
  // missing numbered chunks like ./331.js) on some setups. Safe to disable.
  experimental: {
    devtoolSegmentExplorer: false,
    // Dev HMR cache can leave stale server chunks → "__webpack_modules__[id] is
    // not a function" / missing ./NNN.js after Fast Refresh.
    serverComponentsHmrCache: false,
  },
  // Named chunk/module IDs for all dev bundles (not only server) reduce missing
  // `./331.js`-style requires after HMR.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
      config.optimization = {
        ...config.optimization,
        moduleIds: "named",
        chunkIds: "named",
      };
    }
    return config;
  },
};

export default nextConfig;
