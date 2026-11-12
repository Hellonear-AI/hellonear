// The browser only talks to this app; `/api/v1/*` is forwarded to the backend (apps/be).
// Going through our own origin keeps the `hn_session` cookie first-party, which also works
// from http://localhost against the hosted API (its cookie is SameSite=Lax and Secure).
// The backend still checks the forwarded Origin header against its FE_ORIGIN list.
const API_URL = (process.env.HELLONEAR_API_URL || "http://localhost:4000").replace(/\/+$/, "")

// The first public name. hellonear.xyz is the landing page (apps/landing, on its own port since #266).
const OTHER_HOSTS = ["hellonear.jameshub.fun"]

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Mind avatars ask for quality 90 (round crops of detailed art); next/image only allows listed ones.
  images: { qualities: [75, 90] },
  // Only when /api/v1 goes through this app (local dev, no NEXT_PUBLIC_API_URL): compressing the
  // forwarded chat stream can hold its events back until the end, so steps, text and Stop's run id
  // came all at once (Ancung, 10 Nov; the cause is not proven). The hosted build calls the API
  // directly and keeps compression.
  compress: Boolean(process.env.NEXT_PUBLIC_API_URL),
  // The public web app is https://app.hellonear.xyz. The old name sends visitors there, because
  // the build calls one API (api.hellonear.xyz) and the session cookie only reaches it from the same site.
  async redirects() {
    return OTHER_HOSTS.map((host) => ({ source: "/:path*", has: [{ type: "host", value: host }], destination: "https://app.hellonear.xyz/:path*", permanent: false }))
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/v1/:path*` }]
  },
}
