import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: {
      entry: "main.ts",
      formats: ["iife"],
      name: "Digest",
      fileName: () => "app.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
