/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output so the Docker image carries only the server and the
  // traced dependencies, rather than the whole node_modules tree.
  output: "standalone",
  poweredByHeader: false,
  // The backend URL and any API key are read server-side only. Nothing here is
  // exposed through NEXT_PUBLIC_*, so a provider credential cannot reach a
  // browser bundle.
  env: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
