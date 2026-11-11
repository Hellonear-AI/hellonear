import type { NextConfig } from "next";

// The images, the 3D Mind and the logos in public/ keep their names when they change, so they are
// cached for a day (then served stale for another while being revalidated) instead of being checked on
// every visit. Next's own /_next/static files are already cached for good by name.
const ASSETS = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async headers() {
    return ["/hero/:path*", "/scenes/:path*", "/minds/:path*", "/brands/:path*", "/draco/:path*"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: ASSETS }],
    }));
  },
};

export default nextConfig;
