// Prose verification for the aura-digest skill body (slice 4):
// - no bash shell-outs to aura-digest.mjs in the skill body
// - the tool-driven flow is present and coherent
// - no live references to the deleted CLI bundle (aura-digest.mjs, dist/aura-digest)

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SKILL_PATH = path.resolve(
  import.meta.dirname,
  "../../skills/core/aura-digest/aura-digest.md",
);

function readSkillBody(): string {
  const raw = readFileSync(SKILL_PATH, "utf-8");
  const marker = "\n---\n";
  const frontmatterEnd = raw.indexOf(marker, 3);
  if (frontmatterEnd === -1) {
    throw new Error("Could not find end of skill frontmatter");
  }
  return raw.slice(frontmatterEnd + marker.length);
}

function extractBashBlocks(body: string): string[] {
  const blocks: string[] = [];
  const regex = /```bash\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

describe("aura-digest skill prose", () => {
  const body = readSkillBody();
  const bashBlocks = extractBashBlocks(body);
  const fullRaw = readFileSync(SKILL_PATH, "utf-8");

  it("has no bash shell-outs to aura-digest.mjs fetch/render/cleanup/save/diff/last", () => {
    const forbiddenSubcommands = ["fetch", "render", "cleanup", "save", "diff", "last"];
    const violations: string[] = [];

    for (const block of bashBlocks) {
      if (!block.includes("node") || !block.includes("aura-digest.mjs")) {
        continue;
      }
      for (const sub of forbiddenSubcommands) {
        // Match "aura-digest.mjs <sub>" with flexible whitespace.
        const pattern = new RegExp(`aura-digest\\.mjs\\s+${sub}\\b`);
        if (pattern.test(block)) {
          violations.push(`found "aura-digest.mjs ${sub}" in bash block: ${block.slice(0, 120)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not contain old render/cleanup/diff/last subcommand sections", () => {
    // Dropped subcommands are no longer described as skill steps.
    expect(body).not.toMatch(/^##\s+Render$/m);
    expect(body).not.toMatch(/^##\s+Cleanup$/m);
    expect(body).not.toMatch(/^##\s+Diff$/m);
    expect(body).not.toMatch(/^##\s+Last$/m);
  });

  it("does not contain the old $OUT temp-dir bash plumbing", () => {
    expect(body).not.toContain("$OUT");
    expect(body).not.toContain("sed -n 's/^output directory");
  });

  it("describes the tool-driven flow end-to-end", () => {
    const lower = body.toLowerCase();
    expect(lower).toContain("digest-fetch");
    expect(lower).toContain("digest-save");
    expect(lower).toContain("digest-dashboard-start");
    expect(lower).toContain("digest-dashboard-stop");
    expect(lower).toMatch(/augment[\s\S]*re-rank|re-rank[\s\S]*augment/);
  });

  it("keeps the routing table", () => {
    expect(body).toMatch(/^## Routing table$/m);
  });

  it("documents the digest-update + digest-ack tools for the lock + ack/clear", () => {
    // The old `node -e` one-liners (editing ~/.pi/aura/digest.json + state.json)
    // are gone — the in-process dashboard reads the in-memory store. The lock
    // + ack are now first-class tools.
    expect(body).toMatch(/digest-update/);
    expect(body).toMatch(/digest-ack/);
    expect(body).not.toMatch(/node -e .*currentlyWorkingOn/);
    expect(body).not.toMatch(/node -e .*type:\\"ack\\"/);
  });

  it("does not reference aura-digest.mjs or dist/aura-digest as a live path", () => {
    // After the CLI deletion (task cli-deletion-and-rewire), the skill doc
    // should not mention the deleted bundle as a live path — neither in the
    // frontmatter description nor in the body. The flow runs entirely
    // in-process via typed tools (digest-fetch, digest-log, digest-save,
    // digest-update, digest-ack, the digest-dashboard).
    expect(fullRaw).not.toContain("aura-digest.mjs");
    expect(fullRaw).not.toContain("dist/aura-digest");
  });

  it("does not describe the deleted digest bundle, esbuild, or task build for the digest", () => {
    // The skill doc should not describe the deleted esbuild bundle or the
    // `task build` step that produced it. (The aura skill's aura.mjs bundle
    // is separate and stays — but this skill doc shouldn't describe it.)
    expect(body).not.toContain("bundled by esbuild");
    expect(body).not.toContain("dist/aura-digest.mjs");
    expect(body).not.toMatch(/task build.*aura-digest/);
  });
});
