import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.SUMMONERKIT_MOBILE_BASE ?? "/",
  build: { target: "es2022" },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/App.tsx", "src/pairing.ts", "src/mobile-view.ts"],
      thresholds: {
        statements: 35,
        branches: 23,
        functions: 39,
        lines: 37,
      },
    },
  },
});
