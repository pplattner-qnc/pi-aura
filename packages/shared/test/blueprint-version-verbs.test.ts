// Tests for the two AuraClient verbs added by the engineering-sync-skill task:
// `getBlueprintFiles` and `getKnowledgeNodeVersion`.
//
// Seam: mock the generated SDK calls by replacing the `.get` method on the
// @hey-api/client-fetch `Client` (same harness pattern as review-verbs.test.ts).
// Each generated function calls `options.client.get(...)`, so mocking that
// method lets us assert the URL/path/query and the domain mapping without
// network calls.

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createClient, type Client } from "@hey-api/client-fetch";
import { HeyApiAuraClient, AuraApiError } from "../src/hey-api-aura-client.js";
import type { Keyring, StoredSecret, SecretKey } from "../src/keyring/index.js";

// A fake keyring that returns a test PAT.
class FakeKeyring implements Keyring {
  constructor(private readonly pat: string | null) {}
  async getSecret(key: SecretKey): Promise<string | null> {
    assert.equal(key.service, "aura");
    assert.equal(key.name, "pat");
    return this.pat;
  }
  async setSecret(_key: SecretKey, _secret: string): Promise<void> {}
  async deleteSecret(_key: SecretKey): Promise<boolean> { return true; }
  async listSecrets(): Promise<StoredSecret[]> { return []; }
}

function callArg(mockFn: ReturnType<typeof mock.method>): Record<string, unknown> {
  return mockFn.mock.calls[0].arguments[0] as Record<string, unknown>;
}

function makeHarness(opts: { getReturn: { data: unknown; error: unknown; response: Response } }): {
  client: HeyApiAuraClient;
  getMock: ReturnType<typeof mock.method>;
} {
  const mockClient = createClient({ baseUrl: "http://localhost:9999/api" });
  const getMock = mock.method(
    mockClient,
    "get",
    () => Promise.resolve(opts.getReturn),
  );
  const client = new HeyApiAuraClient({
    keyring: new FakeKeyring("test-pat-123"),
    baseUrl: "http://localhost:9999/api",
    pat: "test-pat-123",
  });
  (client as unknown as { client: Client }).client = mockClient;
  return { client, getMock };
}

beforeEach(() => {
  // mock.method restores automatically after each test.
});

// Sample generated payload for getBlueprintFiles.
const SAMPLE_BLUEPRINT_FILES = {
  ok: true,
  files: [
    {
      path: "blueprint/skills/ai-setup/skill.md",
      filename: "SKILL.md",
      encoding: "utf8",
      content: "# AI Setup\n\nbody",
      checksum: "sha256:abc123",
      version: 4,
      provenance: { created_by_user_id: 7, source_commit_sha: "commit-sha-1" },
    },
    {
      path: "blueprint/manifest.yaml",
      filename: "manifest.yaml",
      encoding: "utf8",
      content: "files: []",
      checksum: "sha256:manifesthash",
      version: 1,
      provenance: { created_by_user_id: 7, source_commit_sha: "commit-sha-2" },
    },
  ],
};

// Sample generated payload for getKnowledgeNodeVersion.
const SAMPLE_NODE_VERSION = {
  id: "ver-uuid-1",
  node_id: "node-uuid-1",
  version: 2,
  body: "# Prior version body\n",
  summary: "prior",
  created_by_user_id: 3,
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("HeyApiAuraClient blueprint + version verbs", () => {
  it("getBlueprintFiles calls GET /mcp/blueprint/files with path + version query, maps files", async () => {
    const { client, getMock } = makeHarness({
      getReturn: { data: SAMPLE_BLUEPRINT_FILES, error: undefined, response: new Response("{}", { status: 200 }) },
    });

    const result = await client.getBlueprintFiles({ path: "blueprint/skills/ai-setup", version: "sha256:old" });

    assert.equal(getMock.mock.calls.length, 1);
    const call = callArg(getMock);
    assert.equal(call.url, "/mcp/blueprint/files");
    assert.deepEqual(call.query, { path: "blueprint/skills/ai-setup", version: "sha256:old" });

    // Domain mapping.
    assert.equal(result.ok, true);
    assert.equal(result.files.length, 2);
    const f0 = result.files[0];
    assert.equal(f0.path, "blueprint/skills/ai-setup/skill.md");
    assert.equal(f0.filename, "SKILL.md");
    assert.equal(f0.encoding, "utf8");
    assert.equal(f0.content, "# AI Setup\n\nbody");
    assert.equal(f0.checksum, "sha256:abc123");
    assert.equal(f0.version, 4);
    assert.deepEqual(f0.provenance, { created_by_user_id: 7, source_commit_sha: "commit-sha-1" });
  });

  it("getBlueprintFiles without version omits the version query", async () => {
    const { client, getMock } = makeHarness({
      getReturn: { data: { ok: true, files: [] }, error: undefined, response: new Response("{}", { status: 200 }) },
    });

    const result = await client.getBlueprintFiles({ path: "manifest.yaml" });

    assert.equal(result.files.length, 0);
    assert.equal(result.ok, true);
    const call = callArg(getMock);
    assert.deepEqual(call.query, { path: "manifest.yaml", version: undefined });
  });

  it("getBlueprintFiles throws AuraApiError when the SDK returns an error", async () => {
    const { client } = makeHarness({
      getReturn: { data: undefined, error: { detail: "forbidden" }, response: new Response("{}", { status: 403 }) },
    });

    await assert.rejects(
      () => client.getBlueprintFiles({ path: "manifest.yaml" }),
      (e: unknown) => e instanceof AuraApiError && e.status === 403,
    );
  });

  it("getBlueprintFiles throws when the endpoint returns ok:false with an error body", async () => {
    const { client } = makeHarness({
      getReturn: {
        data: { ok: false, error: { code: "NOT_FOUND", detail: "no such path" } },
        error: undefined,
        response: new Response("{}", { status: 200 }),
      },
    });

    await assert.rejects(
      () => client.getBlueprintFiles({ path: "blueprint/nope" }),
      (e: unknown) => e instanceof AuraApiError && /NOT_FOUND/.test(e.message),
    );
  });

  it("getKnowledgeNodeVersion calls GET /knowledge/nodes/{uuid}/versions/{version} and maps body", async () => {
    const { client, getMock } = makeHarness({
      getReturn: { data: SAMPLE_NODE_VERSION, error: undefined, response: new Response("{}", { status: 200 }) },
    });

    const result = await client.getKnowledgeNodeVersion("node-uuid-1", 2);

    assert.equal(getMock.mock.calls.length, 1);
    const call = callArg(getMock);
    assert.equal(call.url, "/knowledge/nodes/{uuid}/versions/{version}");
    assert.deepEqual(call.path, { uuid: "node-uuid-1", version: 2 });

    // Domain mapping.
    assert.equal(result.id, "ver-uuid-1");
    assert.equal(result.node_id, "node-uuid-1");
    assert.equal(result.version, 2);
    assert.equal(result.body, "# Prior version body\n");
    assert.equal(result.summary, "prior");
    assert.equal(result.created_by_user_id, 3);
    assert.equal(result.created_at, "2026-01-01T00:00:00.000Z");
  });

  it("getKnowledgeNodeVersion maps null summary to null", async () => {
    const { client } = makeHarness({
      getReturn: {
        data: { ...SAMPLE_NODE_VERSION, summary: null },
        error: undefined,
        response: new Response("{}", { status: 200 }),
      },
    });

    const result = await client.getKnowledgeNodeVersion("node-uuid-1", 2);
    assert.equal(result.summary, null);
  });

  it("getKnowledgeNodeVersion throws AuraApiError on SDK error", async () => {
    const { client } = makeHarness({
      getReturn: { data: undefined, error: { detail: "not found" }, response: new Response("{}", { status: 404 }) },
    });

    await assert.rejects(
      () => client.getKnowledgeNodeVersion("node-uuid-1", 99),
      (e: unknown) => e instanceof AuraApiError && e.status === 404,
    );
  });
});
