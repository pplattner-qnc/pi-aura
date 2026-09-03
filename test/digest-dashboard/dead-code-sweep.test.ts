// Slice 3 — dead-code-and-bundle-sweep verification.
// Asserts the dead file-based functions are removed from state.ts and
// that server.ts has no self-run entry block (no process.argv[1] check).
// This is a structural/grep-style test: it verifies the dead code is gone,
// not that any runtime behavior changed (slices 1–2 already moved to
// in-process + in-memory).

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const extDir = path.resolve(__dirname, "../../.pi/extensions/digest-dashboard");

function readExtFile(filename: string): string {
  return fs.readFileSync(path.join(extDir, filename), "utf-8");
}

describe("slice 3 — dead-code-and-bundle-sweep", () => {
  describe("state.ts dead code removed", () => {
    it("does not export writePid", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("export function writePid");
    });

    it("does not export clearPid", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("export function clearPid");
    });

    it("does not export readState", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("export function readState");
    });

    it("does not export the file-write appendEvent", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("export function appendEvent");
    });

    it("does not export EMPTY_STATE", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("EMPTY_STATE");
    });

    it("does not define the StateFile interface", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("StateFile");
    });

    it("does not have writeQueues / ensureDir / enqueue helpers", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("writeQueues");
      expect(source).not.toContain("ensureDir");
      expect(source).not.toContain("enqueue");
    });

    it("does not import file-system write helpers (mkdirSync, writeFileSync)", () => {
      const source = readExtFile("state.ts");
      expect(source).not.toContain("mkdirSync");
      expect(source).not.toContain("writeFileSync");
    });

    it("still exports the StateEvent type (used by store.ts/listener.ts/server.ts)", () => {
      const source = readExtFile("state.ts");
      expect(source).toContain("export interface StateEvent");
    });

    it("still exports the AckPayload type", () => {
      const source = readExtFile("state.ts");
      expect(source).toContain("export interface AckPayload");
    });

    it("still exports the UpdateViewPayload type", () => {
      const source = readExtFile("state.ts");
      expect(source).toContain("export interface UpdateViewPayload");
    });
  });

  describe("server.ts self-run entry removed", () => {
    it("does not have a process.argv[1] self-run check", () => {
      const source = readExtFile("server.ts");
      expect(source).not.toContain("process.argv[1]");
    });

    it("does not define defaultAuraPaths", () => {
      const source = readExtFile("server.ts");
      expect(source).not.toContain("defaultAuraPaths");
    });

    it("does not have a signal/exit cleanup block", () => {
      const source = readExtFile("server.ts");
      expect(source).not.toContain("SIGTERM");
      expect(source).not.toContain("SIGHUP");
      expect(source).not.toContain("beforeExit");
    });

    it("still exports startServer", () => {
      const source = readExtFile("server.ts");
      expect(source).toContain("export async function startServer");
    });

    it("still exports openBrowser", () => {
      const source = readExtFile("server.ts");
      expect(source).toContain("export function openBrowser");
    });
  });

  describe("esbuild server bundle removed", () => {
    it("does not have esbuild.config.mjs", () => {
      expect(fs.existsSync(path.join(extDir, "esbuild.config.mjs"))).toBe(false);
    });

    it("does not have dist/server.mjs", () => {
      expect(fs.existsSync(path.join(extDir, "dist", "server.mjs"))).toBe(false);
    });

    it("package.json build script is vite-only (no esbuild.config.mjs)", () => {
      const pkg = JSON.parse(readExtFile("package.json"));
      expect(pkg.scripts.build).toBe("vite build");
    });
  });

  describe("index.ts does not import dead state.ts functions", () => {
    it("does not import clearPid or writePid", () => {
      const source = readExtFile("index.ts");
      expect(source).not.toMatch(/\bclearPid\b/);
      expect(source).not.toMatch(/\bwritePid\b/);
      expect(source).not.toMatch(/\breadState\b/);
    });
  });
});
