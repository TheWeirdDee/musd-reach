import type { NextConfig } from "next";

// Test-only switches must never reach a hosted build: they replace the contract addresses, relabel
// the chain as a fork, or add a keyless mock wallet. src/lib/reach.ts also ignores them in production.
const TEST_ONLY_ENV = ["NEXT_PUBLIC_E2E_ACCOUNT", "NEXT_PUBLIC_REACH_DEPLOYMENT", "NEXT_PUBLIC_NETWORK_MODE"];
if (process.env.NODE_ENV === "production") {
  const set = TEST_ONLY_ENV.filter((k) => process.env[k]);
  if (set.length) throw new Error(`Refusing a production build with test-only variables set: ${set.join(", ")}. Unset them; they work only with \`next dev\`.`);
}

const nextConfig: NextConfig = {
  // Keep review artifacts separate from a developer's running .next server.
  distDir: process.env.REACH_BUILD_DIR ?? ".next",
  transpilePackages: ["@musd-reach/sdk", "@musd-reach/protocol-registry"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
