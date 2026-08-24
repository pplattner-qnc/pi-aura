import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(__dirname, "server.ts")],
  outfile: path.join(__dirname, "dist", "server.mjs"),
  platform: "node",
  format: "esm",
  bundle: true,
  external: ["node:*"],
  minify: false,
  logLevel: "info",
});
