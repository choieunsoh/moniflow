import type { NextConfig } from 'next';

const config: NextConfig = {
  // better-sqlite3 is a native addon — never bundle it for the server.
  serverExternalPackages: ['better-sqlite3'],
};

export default config;
