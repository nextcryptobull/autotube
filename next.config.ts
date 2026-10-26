import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    // Required for ffmpeg.wasm (uses SharedArrayBuffer for multi-threading).
    // credentialless allows loading cross-origin resources (Z.ai image URLs)
    // without needing them to set CORP headers.
    // Supported in Chrome 96+, Firefox 110+, Safari 16+.
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
