// openapi-ts.config.ts — codegen config for the Aura REST client.
//
// Regenerate with:  npm run codegen
//
// Input  : openapi/openapi.yaml   (the Aura API spec, OpenAPI 3.1)
// Output : src/generated/         (typed client built on @hey-api/client-fetch,
//                                 one typed function per operationId)
//
// We pin @hey-api/openapi-ts@0.64.x: it accepts a local file path as `input`.
// The 0.99 line routes `input` through a "org/project" Hey API platform
// shorthand and no longer supports local-file generation directly.
//
// In the 0.64 plugin model the HTTP client is itself a plugin, so we list it
// explicitly alongside the default @hey-api/typescript + @hey-api/sdk plugins
// (when you set `plugins`, the defaults are no longer added automatically).

import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "openapi/openapi.yaml",
  output: "src/generated",
  plugins: [
    // TypeScript interfaces for every component schema + request/response.
    "@hey-api/typescript",
    // One typed function per operationId (tree-shakeable, function-based).
    "@hey-api/sdk",
    // Native-fetch HTTP client the SDK functions call into.
    "@hey-api/client-fetch",
  ],
});
