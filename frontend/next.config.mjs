/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Use Next.js basePath for API routing (industry standard)
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  
  // Simplified environment variables
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || '/api'
  },
  
  async rewrites() {
    // Only proxy in development when no external gateway is configured
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_API_BASE?.startsWith('http')) {
      const target = process.env.GATEWAY_PROXY_TARGET || 'http://localhost:4000';
      return [
        {
          source: '/api/:path*',
          destination: `${target}/api/:path*`
        }
      ];
    }
    return [];
  }
};

export default nextConfig;