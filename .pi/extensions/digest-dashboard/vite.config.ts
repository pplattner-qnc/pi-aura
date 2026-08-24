import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    lib: {
      entry: "main.ts",
      formats: ["iife"],
      name: "Digest",
      fileName: () => "app.js",
      cssFileName: "app",
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
