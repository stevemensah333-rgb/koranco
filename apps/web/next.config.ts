import type { NextConfig } from "next";

if (!process.env.NEXT_PUBLIC_API_ORIGIN) {
  throw new Error("NEXT_PUBLIC_API_ORIGIN is required");
}

const nextConfig: NextConfig = {
  agentRules: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "encrypted-tbn0.gstatic.com",
        pathname: "/images",
      },
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
