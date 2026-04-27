import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  outDir: "dist/cli",
  format: ["esm"],
  target: "node20",
  platform: "node",
  splitting: false,
  sourcemap: true,
  clean: true,
  // Don't bundle native modules
  external: ["better-sqlite3"],
  // Resolve path aliases
  esbuildOptions(options) {
    options.alias = {
      "@/*": "./src/*",
    };
  },
});
