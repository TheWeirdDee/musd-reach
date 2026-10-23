import { defineConfig } from "vitest/config";

// The first test in each file pays cold imports (Fastify, PGlite, the SDK). Under the parallel
// workspace run (`pnpm -r test`) that has exceeded vitest's 5 s default and failed a passing test.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
