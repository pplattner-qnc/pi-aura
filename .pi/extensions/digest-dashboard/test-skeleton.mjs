import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ext = __dirname;

function pkg() {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
}

// 1. Sub-package package.json shape
assert(existsSync(path.join(ext, "package.json")), "package.json exists");
const sub = JSON.parse(readFileSync(path.join(ext, "package.json"), "utf8"));
assert.equal(sub.name, "digest-dashboard-ext");
assert.equal(sub.version, "0.1.0");
assert.equal(sub.private, true);
assert.equal(sub.type, "module");
assert.deepEqual(sub.pi?.extensions, ["./index.ts"]);
assert(!("dependencies" in sub) && !("devDependencies" in sub), "no deps fields");

// 2. tsconfig.json shape
const tsconf = JSON.parse(readFileSync(path.join(ext, "tsconfig.json"), "utf8"));
assert.equal(tsconf.compilerOptions.target, "ES2022");
assert.equal(tsconf.compilerOptions.module, "NodeNext");
assert.deepEqual(tsconf.compilerOptions.lib, ["ES2022", "DOM"]);
assert.equal(tsconf.compilerOptions.strict, true);
assert.equal(tsconf.compilerOptions.allowImportingTsExtensions, true);
assert(tsconf.include.includes("**/*.ts"));
assert(tsconf.exclude.includes("node_modules") && tsconf.exclude.includes("dist"));

// 3. vite.config.ts and build produce dist/app.js
assert(existsSync(path.join(ext, "vite.config.ts")), "vite.config.ts exists");
const viteBuild = spawnSync("npx", ["vite", "build"], { cwd: ext, encoding: "utf8", shell: false });
assert.equal(viteBuild.status, 0, `vite build failed: ${viteBuild.stderr}`);
assert(existsSync(path.join(ext, "dist", "app.js")), "dist/app.js produced");

// 4. esbuild config produces dist/server.mjs
const esb = spawnSync("node", [path.join(ext, "esbuild.config.mjs")], { cwd: ext, encoding: "utf8", shell: false });
assert.equal(esb.status, 0, `esbuild failed: ${esb.stderr}`);
assert(existsSync(path.join(ext, "dist", "server.mjs")), "dist/server.mjs produced");

// 5. index.ts compiles under sub-package tsconfig
const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: ext, encoding: "utf8", shell: false });
assert.equal(tsc.status, 0, `tsc failed: ${tsc.stderr}`);

// 6. Root package.json registers the extension
const rootPkg = pkg();
assert(rootPkg.pi?.extensions.includes("./.pi/extensions/digest-dashboard/index.ts"), "root pi.extensions entry");

// 7. Root devDependencies include build tooling
const dev = rootPkg.devDependencies || {};
assert(dev.svelte);
assert(dev.vite);
assert(dev["@sveltejs/vite-plugin-svelte"]);
assert(dev.typescript);
assert(dev["@types/node"]);

// 8. index.ts registers the digest-dashboard command (basic source check)
const idx = readFileSync(path.join(ext, "index.ts"), "utf8");
assert(idx.includes('registerCommand("digest-dashboard"'), "registers command");
assert(idx.includes("ctx.ui.notify"), "has stub notify");

console.log("skeleton verification passed");
