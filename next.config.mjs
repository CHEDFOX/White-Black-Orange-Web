/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The backend URL is read server-side only. Provider credentials live on the
  // backend and must never reach a browser bundle, so nothing here is exposed
  // through NEXT_PUBLIC_*.
  env: {},
  async rewrites() {
    return [];
  },
};

export default nextConfig;
