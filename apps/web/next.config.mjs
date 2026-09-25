import path from 'node:path';

/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // The workspace packages are consumed as source, not as built dist. That is
  // what makes `pnpm dev` reflect an edit to a feature without a rebuild, and
  // it is why the Dockerfile installs first and runs second.
  transpilePackages: [
    '@battle-agents/agent',
    '@battle-agents/api',
    '@battle-agents/core',
    '@battle-agents/db',
    // Added because event-batch reads the batch limits and the buffer from
    // protocol, and a package that is transpiled through one of its consumers
    // still has to be listed if the bundler sees it directly.
    '@battle-agents/protocol',
  ],
  // `@` is the src directory. The route handlers import the gateway, the auth
  // server and the shared route table through it, and the alias was never
  // declared here, so `next build` failed to resolve every one of them while
  // `tsc` and vitest passed: both of those read tsconfig paths, and neither
  // reads this file. A build that no type check and no test can see failing
  // is the same class of thing as the gates that were green while checking
  // nothing.
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve('./src');
    // Every import in this app is written with a .js suffix, which is what the
    // NodeNext module resolution the rest of the monorepo uses. webpack takes
    // that suffix literally and looks for a .js file that does not exist,
    // because the source is .ts. Mapping the extension is what lets one
    // convention hold across tsc, vitest and the bundler.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
