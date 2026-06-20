import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled deliberately. React StrictMode double-invokes effects in dev, which
  // makes Supabase Realtime re-`.on()` an already-subscribed channel ("cannot add
  // callbacks after subscribe()") and leaves the Yjs provider stuck "Connecting".
  // BlockNote also recommends disabling it. Production never runs StrictMode, so
  // this only changes dev behaviour to match prod.
  reactStrictMode: false,
};

export default nextConfig;
