import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Vitest config for the digest-dashboard Svelte component tests (and any
// future root tests). Mirrors pi-annotate: Svelte plugin with client build,
// browser conditions under Vitest, and happy-dom for UI tests.
export default defineConfig({
  plugins: [svelte()],
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
