import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Agents find the Markdown index from any page (llms.txt convention), and caches keep HTML and Markdown apart.
        source: "/:path*",
        headers: [
          { key: "Link", value: '</llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt"' },
          { key: "Vary", value: "Accept" },
        ],
      },
    ];
  },
};

export default nextConfig;
