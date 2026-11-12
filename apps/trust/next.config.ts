import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Agents find the Markdown index from any page (llms.txt convention).
    return [{ source: "/:path*", headers: [{ key: "Link", value: '</llms.txt>; rel="llms-txt"' }] }];
  },
};

export default nextConfig;
