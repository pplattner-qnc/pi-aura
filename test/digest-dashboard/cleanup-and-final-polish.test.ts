// Slice 2 — cleanup-and-final-polish verification.
//
// Structural/grep-style tests: verify the final polish state after slice 1
// (digest-log direct push) landed. This slice is NO behavior change — it
// confirms no residual dead HTTP-POST refs, confirms digest-save is in its
// final state, and asserts the digest-log tool description + the skill-doc
// digest-log line no longer say "no-op if the dashboard is not running"
// (the always-records semantics from slice 1).

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");
const extDir = path.resolve(repoRoot, ".pi/extensions/digest-dashboard");
const skillDocPath = path.resolve(repoRoot, "skills/core/aura-digest/aura-digest.md");

function readExtFile(filename: string): string {
  return fs.readFileSync(path.join(extDir, filename), "utf-8");
}

/**
 * Extract the registerTool block for a given tool name from index.ts source.
 * registerTool calls use `name: "tool-name"` — this finds that marker and
 * returns the source from that line to the next `pi.registerTool({` or EOF.
 */
function extractToolBlock(source: string, toolName: string): string {
  const marker = `name: "${toolName}"`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`tool ${toolName} not found in source`);
  // Find the next registerTool call after this one (end of block).
  const nextRegister = source.indexOf("pi.registerTool({", start + marker.length);
  return source.slice(start, nextRegister > start ? nextRegister : undefined);
}

describe("slice 2 — cleanup-and-final-polish", () => {
  describe("no-dead-refs seam (index.ts)", () => {
    it("does not reference joinUrl", () => {
      const source = readExtFile("index.ts");
      expect(source).not.toMatch(/\bjoinUrl\b/);
    });

    it("does not reference readDashboardUrl", () => {
      const source = readExtFile("index.ts");
      expect(source).not.toMatch(/\breadDashboardUrl\b/);
    });

    it("digest-log execute does not call fetch (no HTTP self-POST)", () => {
      const source = readExtFile("index.ts");
      const logBlock = extractToolBlock(source, "digest-log");
      expect(logBlock).not.toMatch(/\bfetch\s*\(/);
    });
  });

  describe("save-final seam (digest-save unchanged, final state from task 3)", () => {
    it("uses getCurrentDigest to read the in-memory digest", () => {
      const source = readExtFile("index.ts");
      const saveBlock = extractToolBlock(source, "digest-save");
      expect(saveBlock).toContain("getCurrentDigest");
    });

    it("calls saveLastDigest (no dir, no spawn)", () => {
      const source = readExtFile("index.ts");
      const saveBlock = extractToolBlock(source, "digest-save");
      expect(saveBlock).toContain("saveLastDigest");
      expect(saveBlock).not.toContain("spawn");
    });

    it("errors when digest is null (no current digest)", () => {
      const source = readExtFile("index.ts");
      const saveBlock = extractToolBlock(source, "digest-save");
      expect(saveBlock).toContain("no current digest");
    });
  });

  describe("description-polish seam — no stale 'no-op if the dashboard is not running'", () => {
    it("digest-log tool description no longer says 'A no-op if the dashboard is not running'", () => {
      const source = readExtFile("index.ts");
      expect(source).not.toContain("A no-op if the dashboard is not running");
    });

    it("digest-log tool description says it always records (always-records semantics)", () => {
      const source = readExtFile("index.ts");
      const logBlock = extractToolBlock(source, "digest-log");
      // "records" (verb) — distinct from TypeScript's `Record<` type.
      expect(logBlock.toLowerCase()).toContain("records");
    });

    it("digest-log tool description keeps the first sentence (push to the dashboard log list)", () => {
      const source = readExtFile("index.ts");
      const logBlock = extractToolBlock(source, "digest-log");
      expect(logBlock).toContain("Push a single status line to the running digest dashboard's log list");
    });

    it("skill-doc digest-log section no longer says 'It is a no-op if the dashboard is not running'", () => {
      const skillDoc = fs.readFileSync(skillDocPath, "utf-8");
      expect(skillDoc).not.toContain("It is a no-op if the dashboard is not running");
    });

    it("skill-doc digest-log section reflects always-records semantics", () => {
      const skillDoc = fs.readFileSync(skillDocPath, "utf-8");
      expect(skillDoc).toContain("always records");
    });
  });
});
