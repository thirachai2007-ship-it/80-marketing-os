import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/media-buyer/content-analysis-worker": [
      "./node_modules/ffmpeg-static/ffmpeg*",
    ],
    "/api/cron/content-analysis": [
      "./node_modules/ffmpeg-static/ffmpeg*",
    ],
    "/api/media-buyer/content-analysis-auto-run": [
      "./node_modules/ffmpeg-static/ffmpeg*",
    ],
    "/api/media-buyer/content-analysis-coverage": [
      "./node_modules/ffmpeg-static/ffmpeg*",
    ],
    "/api/media-buyer/analysis-batch-orchestrator": [
      "./node_modules/ffmpeg-static/ffmpeg*",
    ],
  },
};

export default nextConfig;
