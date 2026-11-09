// The browser only talks to this app; `/api/v1/*` is forwarded to the backend (apps/be).
// Going through our own origin keeps the `hn_session` cookie first-party, which also works
// from http://localhost against the hosted API (its cookie is SameSite=Lax and Secure).
// The backend still checks the forwarded Origin header against its FE_ORIGIN list.
const API_URL = (process.env.HELLONEAR_API_URL || "http://localhost:4000").replace(/\/+$/, "")

const OTHER_HOSTS = ["www.hellonear.xyz", "hellonear.jameshub.fun"]

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // The public web app is https://hellonear.xyz. The old demo name and www send visitors there, because
  // the build calls one API (api.hellonear.xyz) and the session cookie only reaches it from the same site.
  async redirects() {
    return OTHER_HOSTS.map((host) => ({ source: "/:path*", has: [{ type: "host", value: host }], destination: "https://hellonear.xyz/:path*", permanent: false }))
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/v1/:path*` }]
  },
}
