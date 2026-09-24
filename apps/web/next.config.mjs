/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages are consumed as source, not as built dist. That is
  // what makes `pnpm dev` reflect an edit to a feature without a rebuild, and it
  // is why the Dockerfile installs first and runs second.
  transpilePackages: [
    '@battle-agents/agent',
    '@battle-agents/api',
    '@battle-agents/core',
    '@battle-agents/db',
  ],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
