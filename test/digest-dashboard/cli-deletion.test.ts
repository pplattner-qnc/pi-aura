// Slice 1 — delete-cli-shim-and-bundle verification.
// Structural/grep-style test: asserts the aura-digest CLI shim, the committed
// bundle, and the esbuild entry that builds it are gone (the in-process tools
// are the sole path now). The orphaned scripts/src/keyring.ts (dead since
// core-move) + scripts/profile-fetch.mjs (ran the deleted bundle) are gone.
// The aura skill's aura.mjs bundle STAYS (separate skill — not deleted).
// The shared-core exports the shim used STAY (slice 2 removes them).

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

function repoPath(rel: string): string {
  return path.join(repoRoot, rel);
}

describe("slice 1 — delete-cli-shim-and-bundle", () => {
  describe("no-CLI seam", () => {
    it("does not have scripts/src/aura-digest.ts (the CLI shim)", () => {
      expect(fs.existsSync(repoPath("scripts/src/aura-digest.ts"))).toBe(false);
    });

    it("does not have skills/core/aura-digest/dist/aura-digest.mjs (the committed bundle)", () => {
      expect(fs.existsSync(repoPath("skills/core/aura-digest/dist/aura-digest.mjs"))).toBe(false);
    });

    it("does not have an aura-digest entry in esbuild.config.mjs", () => {
      const config = fs.readFileSync(repoPath("scripts/esbuild.config.mjs"), "utf-8");
      expect(config).not.toContain("src/aura-digest.ts");
      expect(config).not.toContain("aura-digest/dist/aura-digest.mjs");
    });
  });

  describe("aura-mjs-stays seam", () => {
    it("still has the aura entry in esbuild.config.mjs", () => {
      const config = fs.readFileSync(repoPath("scripts/esbuild.config.mjs"), "utf-8");
      expect(config).toContain("src/aura.ts");
      expect(config).toContain("aura/dist/aura.mjs");
    });

    it("still has scripts/src/aura.ts (the aura skill entry)", () => {
      expect(fs.existsSync(repoPath("scripts/src/aura.ts"))).toBe(true);
    });
  });

  describe("orphan-cleanup seam", () => {
    it("does not have scripts/src/keyring.ts (orphaned since core-move)", () => {
      expect(fs.existsSync(repoPath("scripts/src/keyring.ts"))).toBe(false);
    });

    it("does not have scripts/profile-fetch.mjs (ran the deleted bundle)", () => {
      expect(fs.existsSync(repoPath("scripts/profile-fetch.mjs"))).toBe(false);
    });
  });

  describe("package.json description updated", () => {
    it("description no longer says 'Deterministic Aura digest fetch + render script'", () => {
      const pkg = JSON.parse(fs.readFileSync(repoPath("scripts/package.json"), "utf-8"));
      expect(pkg.description).not.toBe("Deterministic Aura digest fetch + render script");
      // The new description should mention the aura skill bundle (not the
      // gone digest CLI).
      expect(pkg.description.toLowerCase()).toContain("aura");
    });

    it("still has the build script (node esbuild.config.mjs)", () => {
      const pkg = JSON.parse(fs.readFileSync(repoPath("scripts/package.json"), "utf-8"));
      expect(pkg.scripts.build).toBe("node esbuild.config.mjs");
    });
  });
});
