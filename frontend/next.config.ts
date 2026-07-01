import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";
    return [
      { source: "/health", destination: `${apiUrl}/health` },
      { source: "/auth/:path*", destination: `${apiUrl}/auth/:path*` },
      { source: "/generate-image", destination: `${apiUrl}/generate-image` },
      { source: "/edit-image", destination: `${apiUrl}/edit-image` },
      { source: "/refine-image", destination: `${apiUrl}/refine-image` },
      { source: "/image-action", destination: `${apiUrl}/image-action` },
      { source: "/download-image/:path*", destination: `${apiUrl}/download-image/:path*` },
      { source: "/history", destination: `${apiUrl}/history` },
      { source: "/admin/:path*", destination: `${apiUrl}/admin/:path*` }
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co"
      }
    ]
  }
};

export default nextConfig;
