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
  // @napi-rs/keyring has a native .node binding that cannot be bundled —
  // mark it external so Node resolves it from node_modules at runtime.
  external: ["@napi-rs/keyring", "@napi-rs/keyring-linux-x64-gnu"],
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

// One entry per skill — each bundle only imports what that skill needs, so a
// skill can't accidentally reach another skill's subcommands.
const entries = [
  {
    entryPoints: ["src/aura-digest.ts"],
    // The `aura-digest` skill's morning-routine script.
    outfile: "../skills/aura-digest/dist/aura-digest.mjs",
  },
  {
    entryPoints: ["src/aura.ts"],
    // The `aura` skill's artifact + wiki file-based-workflow script.
    outfile: "../skills/aura/dist/aura.mjs",
  },
];

if (watch) {
  await Promise.all(entries.map((e) => context({ ...baseConfig, ...e }).then((ctx) => ctx.watch())));
  console.log("watching…");
} else {
  await Promise.all(entries.map((e) => build({ ...baseConfig, ...e })));
  for (const e of entries) console.log(`built ${e.outfile}`);
}
