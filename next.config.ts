import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled deliberately. React StrictMode double-invokes effects in dev, which
  // makes Supabase Realtime re-`.on()` an already-subscribed channel ("cannot add
  // callbacks after subscribe()") and leaves the Yjs provider stuck "Connecting".
  // BlockNote also recommends disabling it. Production never runs StrictMode, so
  // this only changes dev behaviour to match prod.
  reactStrictMode: false,

  // Allow the public /demo sandbox to be embedded in an <iframe> from ANY origin
  // (it's a dataless, ephemeral demo — safe to embed on a portfolio). Scoped to
  // /demo only, so the authenticated app keeps the browser's default framing
  // protection. `frame-ancestors *` + no X-Frame-Options = embeddable anywhere.
  async headers() {
    const frameable = [{ key: "Content-Security-Policy", value: "frame-ancestors *;" }];
    return [
      { source: "/demo", headers: frameable },
      { source: "/demo/:path*", headers: frameable },
    ];
  },
};

export default nextConfig;
