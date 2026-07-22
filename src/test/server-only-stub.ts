// Vitest alias target for the "server-only" import guard (see vitest.config.ts).
// Next.js's real package throws outside its own bundler; tests run under
// plain Node/vitest, so the import needs to no-op instead.
export {};
