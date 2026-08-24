import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.SUMMONERKIT_MOBILE_BASE ?? "/",
  build: { target: "es2022" },
});
