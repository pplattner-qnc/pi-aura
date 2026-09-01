// Unit tests for the 6 review/approval verbs on HeyApiAuraClient.
//
// Seam: mock the generated SDK calls by replacing the `.get`/`.post` methods on
// the real generated `Client` instance that HeyApiAuraClient
// creates internally. The generated SDK functions delegate to
// `options.client.{get,post}(...)`, so mocking those methods lets us assert
// each verb calls the right URL + path + body + query, and verify the
// domain<->generated mapping — without network calls.
//
// Each verb test asserts:
//   - the right HTTP method + URL were called,
//   - the right generated<->domain arg mapping was applied,
//   - the domain output type is returned (for the two GET verbs),
//   - SDK errors propagate as AuraApiError (error-propagation scenarios).

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../src/generated/client/client.gen.js";
import type { Client } from "../src/generated/client/types.gen.js";
import { HeyApiAuraClient, AuraApiError } from "../src/hey-api-aura-client.js";
import type { AuraClient } from "../src/aura-client.js";
import type { Keyring, StoredSecret, SecretKey } from "../src/keyring/index.js";

// ---------------------------------------------------------------------------
// Fake keyring — returns a test PAT so ensurePat() never hits the OS keyring.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test harness: build a HeyApiAuraClient with a mocked internal Client.
//
// We construct HeyApiAuraClient normally (it creates its own Client), then
// replace the private `client` field with a Client whose .get/.post methods are
// mocked via mock.method. This keeps the request interceptor (PAT header)
// wired but diverts the actual HTTP call to our mock.
// ---------------------------------------------------------------------------

interface MockHarness {
  client: HeyApiAuraClient;
  mockClient: Client;
  postMock: ReturnType<typeof mock.method>;
  getMock: ReturnType<typeof mock.method>;
}

/** Extract the first argument object passed to a mocked client method. */
function callArg(mockFn: ReturnType<typeof mock.method>): Record<string, unknown> {
  return mockFn.mock.calls[0].arguments[0] as Record<string, unknown>;
}

function makeHarness(opts?: {
  getReturn?: { data: unknown; error: unknown; response: Response };
  postReturn?: { data: unknown; error: unknown; response: Response };
}): MockHarness {
  const mockClient = createClient({ baseUrl: "http://localhost:9999/api" });

  const defaultPostReturn = {
    data: undefined,
    error: undefined,
    response: new Response(null, { status: 204 }),
  };
  const defaultGetReturn = {
    data: {},
    error: undefined,
    response: new Response("{}", { status: 200 }),
  };

  const postMock = mock.method(
    mockClient,
    "post",
    () => Promise.resolve(opts?.postReturn ?? defaultPostReturn),
  );
  const getMock = mock.method(
    mockClient,
    "get",
    () => Promise.resolve(opts?.getReturn ?? defaultGetReturn),
  );

  const client = new HeyApiAuraClient({
    keyring: new FakeKeyring("test-pat-123"),
    baseUrl: "http://localhost:9999/api",
    pat: "test-pat-123",
  });
  // Inject the mocked client into the private field.
  (client as unknown as { client: Client }).client = mockClient;

  return { client, mockClient, postMock, getMock };
}

// Convenience: the HeyApiAuraClient request interceptor sets the auth header
// asynchronously; the mock .post/.get intercept it and return immediately.

beforeEach(() => {
  // mock.method restores automatically after each test, but the interceptor
  // on the real client might accumulate; recreate per test via makeHarness.
});

// ---------------------------------------------------------------------------
// Sample generated payloads for the two GET verbs.
// ---------------------------------------------------------------------------

const SAMPLE_REVIEW_OVERVIEW = {
  version: 3,
  review_state: "IN_REVIEW",
  reviewers: [
    {
      user_id: "u1",
      user_name: "Alice",
      status: "ASSIGNED",
      has_review_artifact: false,
      review_artifact_id: null,
      review_artifact_title: null,
    },
    {
      user_id: "u2",
      user_name: "Bob",
      status: "APPROVED",
      has_review_artifact: true,
      review_artifact_id: "rev-art-1",
      review_artifact_title: "Bob's review",
    },
  ],
  review_artifacts: [
    { id: "rev-art-1", title: "Bob's review" },
  ],
  initiator: { user_id: "u-init", user_name: "Initiator" },
  review_started_at: "2026-01-01T00:00:00.000Z",
  review_deadline_at: "2026-01-08T00:00:00.000Z",
  is_initiator: false,
};

const SAMPLE_APPROVALS = {
  version: 3,
  latest_version: 5,
  decided_count: 1,
  total_required: 2,
  open_reviews: [
    { role_id: "r1", role_name: "Owner", user_id: "u1", user_name: "Alice", decided: false },
  ],
  decisions: [
    { id: "dec1", user_id: "u2", user_name: "Bob", decision: "APPROVED", version: 3, created_at: "2026-01-02T00:00:00.000Z" },
  ],
};

// ===========================================================================
// Tests
// ===========================================================================

describe("HeyApiAuraClient review verbs", () => {
  // -------------------------------------------------------------------------
  // 1. getArtifactReview
  // -------------------------------------------------------------------------

  it("getArtifactReview calls GET /artifacts/{id}/review and maps to domain ArtifactReview", async () => {
    const { client, getMock } = makeHarness({
      getReturn: { data: SAMPLE_REVIEW_OVERVIEW, error: undefined, response: new Response("{}", { status: 200 }) },
    });

    const result = await client.getArtifactReview("art-123");

    // Assert the right generated call.
    assert.equal(getMock.mock.calls.length, 1);
    const call = callArg(getMock);
    assert.equal(call.url, "/artifacts/{id}/review");
    assert.deepEqual(call.path, { id: "art-123" });

    // Assert domain mapping.
    assert.equal(result.version, 3);
    assert.equal(result.review_state, "IN_REVIEW");
    assert.equal(result.reviewers.length, 2);
    assert.equal(result.reviewers[0].user_id, "u1");
    assert.equal(result.reviewers[0].user_name, "Alice");
    assert.equal(result.reviewers[0].status, "ASSIGNED");
    assert.equal(result.reviewers[1].status, "APPROVED");
    assert.equal(result.review_artifacts.length, 1);
    assert.equal(result.review_artifacts[0].title, "Bob's review");
    assert.deepEqual(result.initiator, { user_id: "u-init", user_name: "Initiator" });
    assert.equal(result.review_started_at, "2026-01-01T00:00:00.000Z");
    assert.equal(result.review_deadline_at, "2026-01-08T00:00:00.000Z");
    assert.equal(result.is_initiator, false);
  });

  it("getArtifactReview maps null initiator", async () => {
    const { client } = makeHarness({
      getReturn: {
        data: { ...SAMPLE_REVIEW_OVERVIEW, initiator: null },
        error: undefined,
        response: new Response("{}", { status: 200 }),
      },
    });

    const result = await client.getArtifactReview("art-1");
    assert.equal(result.initiator, null);
  });

  // -------------------------------------------------------------------------
  // 2. getArtifactApprovals
  // -------------------------------------------------------------------------

  it("getArtifactApprovals calls GET /artifacts/{id}/approvals and maps to domain ArtifactApprovals", async () => {
    const { client, getMock } = makeHarness({
      getReturn: { data: SAMPLE_APPROVALS, error: undefined, response: new Response("{}", { status: 200 }) },
    });

    const result = await client.getArtifactApprovals("art-456");

    assert.equal(getMock.mock.calls.length, 1);
    const call = callArg(getMock);
    assert.equal(call.url, "/artifacts/{id}/approvals");
    assert.deepEqual(call.path, { id: "art-456" });
    // No version query when opts not provided.
    assert.equal(call.query, undefined);

    // Domain mapping.
    assert.equal(result.version, 3);
    assert.equal(result.latest_version, 5);
    assert.equal(result.decided_count, 1);
    assert.equal(result.total_required, 2);
    assert.equal(result.open_reviews.length, 1);
    assert.equal(result.open_reviews[0].user_id, "u1");
    assert.equal(result.open_reviews[0].user_name, "Alice");
    assert.equal(result.open_reviews[0].decided, false);
    assert.equal(result.decisions.length, 1);
    assert.equal(result.decisions[0].user_name, "Bob");
    assert.equal(result.decisions[0].decision, "APPROVED");
    assert.equal(result.decisions[0].decided, true);
  });

  it("getArtifactApprovals forwards version query param", async () => {
    const { client, getMock } = makeHarness({
      getReturn: { data: SAMPLE_APPROVALS, error: undefined, response: new Response("{}", { status: 200 }) },
    });

    await client.getArtifactApprovals("art-1", { version: 7 });

    const call = callArg(getMock);
    assert.deepEqual(call.query, { version: 7 });
  });

  // -------------------------------------------------------------------------
  // 3. requestArtifactReview
  // -------------------------------------------------------------------------

  it("requestArtifactReview calls POST /artifacts/{id}/review-request with path only, returns void", async () => {
    const { client, postMock } = makeHarness();

    const result = await client.requestArtifactReview("art-789");

    assert.equal(postMock.mock.calls.length, 1);
    const call = callArg(postMock);
    assert.equal(call.url, "/artifacts/{id}/review-request");
    assert.deepEqual(call.path, { id: "art-789" });
    assert.equal(call.body, undefined);
    assert.equal(result, undefined);
  });

  // -------------------------------------------------------------------------
  // 4. startArtifactReview
  // -------------------------------------------------------------------------

  it("startArtifactReview calls POST /artifacts/{id}/review-start with mapped body", async () => {
    const { client, postMock } = makeHarness();

    await client.startArtifactReview({
      id: "art-1",
      version: 3,
      roles: ["OWNER", "CONTRIBUTOR"],
      user_ids: ["u1", "u2"],
      deadline: "2026-01-15",
    });

    const call = callArg(postMock);
    assert.equal(call.url, "/artifacts/{id}/review-start");
    assert.deepEqual(call.path, { id: "art-1" });
    // Domain user_ids → generated userIds (camelCase mapping).
    assert.deepEqual(call.body, {
      version: 3,
      roles: ["OWNER", "CONTRIBUTOR"],
      userIds: ["u1", "u2"],
      deadline: "2026-01-15",
    });
  });

  it("startArtifactReview with optional deadline omitted passes undefined", async () => {
    const { client, postMock } = makeHarness();

    await client.startArtifactReview({
      id: "art-2",
      version: 1,
      roles: ["STAKEHOLDER"],
      user_ids: [],
    });

    const call = callArg(postMock);
    const body = call.body as Record<string, unknown>;
    assert.equal(body.deadline, undefined);
    assert.deepEqual(body.roles, ["STAKEHOLDER"]);
    assert.deepEqual(body.userIds, []);
  });

  it("startArtifactReview with empty roles/user_ids passes them through (server validates)", async () => {
    const { client, postMock } = makeHarness();

    await client.startArtifactReview({
      id: "art-3",
      version: 2,
      roles: [],
      user_ids: [],
    });

    const call = callArg(postMock);
    const body = call.body as Record<string, unknown>;
    assert.deepEqual(body.roles, []);
    assert.deepEqual(body.userIds, []);
  });

  // -------------------------------------------------------------------------
  // 5. submitArtifactDecision
  // -------------------------------------------------------------------------

  it("submitArtifactDecision calls POST /artifacts/{id}/decisions with mapped body", async () => {
    const { client, postMock } = makeHarness();

    await client.submitArtifactDecision({
      id: "art-1",
      version: 4,
      decision: "APPROVED",
    });

    const call = callArg(postMock);
    assert.equal(call.url, "/artifacts/{id}/decisions");
    assert.deepEqual(call.path, { id: "art-1" });
    assert.deepEqual(call.body, { version: 4, decision: "APPROVED" });
  });

  it("submitArtifactDecision with REJECTED decision", async () => {
    const { client, postMock } = makeHarness();

    await client.submitArtifactDecision({
      id: "art-2",
      version: 1,
      decision: "REJECTED",
    });

    const call = callArg(postMock);
    assert.deepEqual(call.body, { version: 1, decision: "REJECTED" });
  });

  // -------------------------------------------------------------------------
  // 6. reopenArtifactReview
  // -------------------------------------------------------------------------

  it("reopenArtifactReview calls POST /artifacts/{id}/review-reopen with version body", async () => {
    const { client, postMock } = makeHarness();

    await client.reopenArtifactReview("art-1", 3);

    const call = callArg(postMock);
    assert.equal(call.url, "/artifacts/{id}/review-reopen");
    assert.deepEqual(call.path, { id: "art-1" });
    assert.deepEqual(call.body, { version: 3 });
  });

  // -------------------------------------------------------------------------
  // 7. Error propagation — each verb propagates SDK error as AuraApiError
  // -------------------------------------------------------------------------

  it("getArtifactReview propagates SDK error as AuraApiError", async () => {
    const { client } = makeHarness({
      getReturn: {
        data: undefined,
        error: { detail: "not found" },
        response: new Response("{}", { status: 404 }),
      },
    });

    await assert.rejects(
      () => client.getArtifactReview("art-404"),
      (e: unknown) => {
        assert.ok(e instanceof AuraApiError, "should be AuraApiError");
        assert.equal((e as AuraApiError).status, 404);
        assert.match((e as Error).message, /not found/);
        return true;
      },
    );
  });

  it("getArtifactApprovals propagates SDK error as AuraApiError", async () => {
    const { client } = makeHarness({
      getReturn: {
        data: undefined,
        error: { detail: "forbidden" },
        response: new Response("{}", { status: 403 }),
      },
    });

    await assert.rejects(
      () => client.getArtifactApprovals("art-x"),
      (e: unknown) => {
        assert.ok(e instanceof AuraApiError);
        assert.equal((e as AuraApiError).status, 403);
        return true;
      },
    );
  });

  it("requestArtifactReview propagates SDK error as AuraApiError", async () => {
    const { client } = makeHarness({
      postReturn: {
        data: undefined,
        error: { detail: "bad request" },
        response: new Response("{}", { status: 400 }),
      },
    });

    await assert.rejects(
      () => client.requestArtifactReview("art-bad"),
      (e: unknown) => {
        assert.ok(e instanceof AuraApiError);
        assert.equal((e as AuraApiError).status, 400);
        return true;
      },
    );
  });

  it("startArtifactReview propagates SDK error as AuraApiError", async () => {
    const { client } = makeHarness({
      postReturn: {
        data: undefined,
        error: { detail: "unprocessable" },
        response: new Response("{}", { status: 422 }),
      },
    });

    await assert.rejects(
      () => client.startArtifactReview({ id: "art-1", version: 1, roles: [], user_ids: [] }),
      (e: unknown) => {
        assert.ok(e instanceof AuraApiError);
        assert.equal((e as AuraApiError).status, 422);
        return true;
      },
    );
  });

  it("submitArtifactDecision propagates SDK error as AuraApiError", async () => {
    const { client } = makeHarness({
      postReturn: {
        data: undefined,
        error: "server error",
        response: new Response("{}", { status: 500 }),
      },
    });

    await assert.rejects(
      () => client.submitArtifactDecision({ id: "art-1", version: 1, decision: "APPROVED" }),
      (e: unknown) => {
        assert.ok(e instanceof AuraApiError);
        assert.equal((e as AuraApiError).status, 500);
        return true;
      },
    );
  });

  it("reopenArtifactReview propagates SDK error as AuraApiError", async () => {
    const { client } = makeHarness({
      postReturn: {
        data: undefined,
        error: { detail: "conflict" },
        response: new Response("{}", { status: 409 }),
      },
    });

    await assert.rejects(
      () => client.reopenArtifactReview("art-1", 1),
      (e: unknown) => {
        assert.ok(e instanceof AuraApiError);
        assert.equal((e as AuraApiError).status, 409);
        return true;
      },
    );
  });

  it("void verbs treat empty (null) data as success, not error", async () => {
    const { client, postMock } = makeHarness({
      postReturn: {
        data: null,
        error: undefined,
        response: new Response(null, { status: 204 }),
      },
    });

    // Should not throw — 204 with null data is success for void verbs.
    const result = await client.requestArtifactReview("art-ok");
    assert.equal(result, undefined);
    assert.equal(postMock.mock.calls.length, 1);
  });

  // -------------------------------------------------------------------------
  // Structural check: all 6 review verbs exist on the interface
  // -------------------------------------------------------------------------

  it("HeyApiAuraClient implements all 6 review verbs (structural check)", () => {
    const { client } = makeHarness();
    const verbs = [
      "getArtifactReview",
      "getArtifactApprovals",
      "requestArtifactReview",
      "startArtifactReview",
      "submitArtifactDecision",
      "reopenArtifactReview",
    ];
    for (const v of verbs) {
      assert.equal(typeof (client as unknown as Record<string, unknown>)[v], "function",
        `verb ${v} should be a function`);
    }
    // TypeScript structural check.
    const _ac: AuraClient = client;
    assert.ok(_ac);
  });
});
