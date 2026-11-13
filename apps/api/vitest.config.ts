import { defineConfig } from "vitest/config";

// The first test in each file pays cold imports (Fastify, PGlite, the SDK). Under the parallel
// workspace run (`pnpm -r test`) that has exceeded vitest's 5 s default and failed a passing test.
export default defineConfig({
  // PGlite start-up in a hook can take over 30 s on a slow or busy machine, so hooks get 120 s.
  test: { testTimeout: 60_000, hookTimeout: 120_000 },
});
