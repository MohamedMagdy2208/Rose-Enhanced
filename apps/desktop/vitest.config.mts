import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 49,
        branches: 44,
        functions: 53,
        lines: 54,
      },
    },
  },
});
