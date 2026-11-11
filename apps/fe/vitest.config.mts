import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // 15 s, not vitest's 5: tests that import a module inside them timed out a few times on Windows
  // with the dev server running beside them, then passed on the rerun (11 Nov).
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 15_000 },
})
