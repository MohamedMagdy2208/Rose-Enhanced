import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 50,
        branches: 49,
        functions: 42,
        lines: 55,
      },
    },
  },
});
