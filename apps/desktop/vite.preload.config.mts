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

function sandboxedPreloadGuard(): Plugin {
  return {
    name: "summonerkit:sandboxed-preload-guard",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const unsupportedRequire = /require\(["'](?!electron["'])[^"']+["']\)/u.exec(output.code)?.[0];
        if (unsupportedRequire) {
          this.error(`Sandboxed preload bundled an unsupported runtime dependency: ${unsupportedRequire}`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [preloadOutputCompatibility(), sandboxedPreloadGuard()],
  build: {
    sourcemap: false,
    rollupOptions: { external: ["electron"] },
  },
});
