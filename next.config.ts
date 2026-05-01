import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  env: {
    NEXT_PUBLIC_TELLER_APPLICATION_ID: process.env.TELLER_APPLICATION_ID,
    NEXT_PUBLIC_TELLER_ENVIRONMENT: process.env.TELLER_ENVIRONMENT ?? "sandbox",
    NEXT_PUBLIC_BUD_API_KEY: process.env.BUD_API_KEY,
  },
};

export default nextConfig;
