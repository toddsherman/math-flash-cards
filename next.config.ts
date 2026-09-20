import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep HTML and all Next.js assets beneath todd.sh/math when proxied.
  basePath: "/math",
};

export default nextConfig;
