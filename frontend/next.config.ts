import type { NextConfig } from "next";

const backendHost = process.env.HOST || 'localhost';
const backendPort = process.env.BACKEND_PORT || 8842;
const BACKEND = process.env.BACKEND_URL ?? `http://${backendHost}:${backendPort}`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND}/api/:path*`,
      },
    ];
  },
  devIndicators: false,
  allowedDevOrigins: ["ncshpcgpu01", "elsa.fda.gov", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ],
      },
    ];
  },
};

export default nextConfig;
