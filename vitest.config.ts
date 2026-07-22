import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "packages/**/*.test.ts"],
    // Integration test files share one Postgres database and TRUNCATE the
    // same tables in beforeEach; running files concurrently races those
    // truncations against other files' inserts (FK violations, "not found"
    // errors from data another file just wiped). Correctness over speed —
    // this project's suite is small enough that serial execution costs
    // nothing that matters.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
