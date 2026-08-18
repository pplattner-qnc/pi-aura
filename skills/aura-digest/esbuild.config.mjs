import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");

const baseConfig = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  banner: {
    // __dirname/__filename aren't defined in ESM; banner provides them.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirname_fn } from 'node:path';",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __dirname_fn(__filename);",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
};

const entries = [
  {
    entryPoints: ["src/aura.ts"],
    outfile: "dist/aura.mjs",
  },
];

if (watch) {
  await context({ ...baseConfig, ...entries[0] }).then((ctx) => ctx.watch());
  console.log("watching…");
} else {
  await build({ ...baseConfig, ...entries[0] });
  console.log("built dist/aura.mjs");
}
