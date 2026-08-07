import type { NextConfig } from "next";

if (!process.env.NEXT_PUBLIC_API_ORIGIN) {
  throw new Error("NEXT_PUBLIC_API_ORIGIN is required");
}

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
