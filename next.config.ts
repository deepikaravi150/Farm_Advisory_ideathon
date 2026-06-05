import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

process.env.AWS_SDK_JS_NODE_VERSION_SUPPORT_WARNING_DISABLED ??= 'true';

const withNextIntl = createNextIntlPlugin('./lib/i18n.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default withNextIntl(nextConfig);
