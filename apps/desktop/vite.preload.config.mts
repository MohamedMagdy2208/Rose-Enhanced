import { defineConfig, type Plugin } from "vite";

function preloadOutputCompatibility(): Plugin {
  return {
    name: "summonerkit:preload-output-compatibility",
    enforce: "post",
    configResolved(config) {
      const output = config.build.rollupOptions.output;
      if (!output) return;
      const outputs = Array.isArray(output) ? output : [output];
      for (const candidate of outputs) {
        // Electron Forge 7.11 still supplies the deprecated Rolldown option.
        // Preserve its single-file preload invariant using the current option.
        delete candidate.inlineDynamicImports;
        candidate.codeSplitting = false;
      }
    },
  };
}

export default defineConfig({
  plugins: [preloadOutputCompatibility()],
  build: {
    sourcemap: false,
    rollupOptions: { external: ["electron"] },
  },
});
