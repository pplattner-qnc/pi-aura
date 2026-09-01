/**
 * Logic tests for the Aura reachability probe added to the aura-tasks
 * extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-health.test.ts
 *
 * Covers the pure logic only: `checkAuraReachable` (any HTTP status ⇒
 * reachable; network / DNS / TLS / timeout / abort ⇒ unreachable) and
 * `formatUnreachableWarning` (reachable ⇒ null, unreachable ⇒ the fixed
 * user-facing message). The session-start wiring (which reads
 * `aura.baseUrl` from settings and calls `ctx.ui.notify`) is exercised by
 * the pi runtime once settings are configured, mirroring how the rest of
 * aura-tasks is verified.
 */

import assert from "node:assert/strict";
import {
  checkAuraReachable,
  formatUnreachableWarning,
} from "./aura-tasks.ts";

// ---------------------------------------------------------------------------
// Helpers — a fake fetch that records calls and returns a canned response
// or throws, so the probe is unit-testable without a network.
// ---------------------------------------------------------------------------

interface FakeFetchCall {
  url: string;
  init?: RequestInit;
}

function makeFakeFetch(opts: {
  status?: number;
  throwErr?: Error;
} = {}): { fetchImpl: typeof fetch; calls: FakeFetchCall[] } {
  const calls: FakeFetchCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (opts.throwErr) throw opts.throwErr;
    return new Response(null, { status: opts.status ?? 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

// ---------------------------------------------------------------------------
// checkAuraReachable — any HTTP status means reachable
// ---------------------------------------------------------------------------

{
  // 200 OK → reachable
  const { fetchImpl, calls } = makeFakeFetch({ status: 200 });
  const result = await checkAuraReachable("https://aura.example/api", fetchImpl);
  assert.equal(result.reachable, true, "200 OK is reachable");
  assert.equal(result.reason, undefined, "reachable has no reason");
  assert.equal(calls.length, 1, "one fetch call");
  assert.equal(calls[0].url, "https://aura.example/api", "probed the base URL");
  assert.equal(calls[0].init?.method, "HEAD", "uses HEAD to avoid a body");
}

{
  // 401 Unauthorized → still reachable (the server answered; auth is separate)
  const { fetchImpl } = makeFakeFetch({ status: 401 });
  const result = await checkAuraReachable("https://aura.example/api", fetchImpl);
  assert.equal(result.reachable, true, "401 is reachable");
}

{
  // 404 Not Found → still reachable (the server answered)
  const { fetchImpl } = makeFakeFetch({ status: 404 });
  const result = await checkAuraReachable("https://aura.example/api", fetchImpl);
  assert.equal(result.reachable, true, "404 is reachable");
}

{
  // 500 Internal Server Error → still reachable (the server answered)
  const { fetchImpl } = makeFakeFetch({ status: 500 });
  const result = await checkAuraReachable("https://aura.example/api", fetchImpl);
  assert.equal(result.reachable, true, "500 is reachable");
}

console.log("checkAuraReachable (HTTP status ⇒ reachable): ok");

// ---------------------------------------------------------------------------
// checkAuraReachable — network / DNS / TLS / abort errors ⇒ unreachable
// ---------------------------------------------------------------------------

{
  // A network error (DNS / connection refused / TLS) → unreachable, carries
  // the underlying error message as the debug reason.
  const { fetchImpl } = makeFakeFetch({ throwErr: new Error("fetch failed: ENOTFOUND") });
  const result = await checkAuraReachable("https://aura.example/api", fetchImpl);
  assert.equal(result.reachable, false, "network error is unreachable");
  assert.equal(result.reason, "fetch failed: ENOTFOUND", "reason is the error message");
}

{
  // A TLS error → unreachable (typical when the VPN is off and the private
  // host is simply not resolvable / reachable).
  const { fetchImpl } = makeFakeFetch({ throwErr: new Error("unable to verify the first certificate") });
  const result = await checkAuraReachable("https://aura.example/api", fetchImpl);
  assert.equal(result.reachable, false, "TLS error is unreachable");
}

{
  // A non-Error throw is stringified into reason (defensive: fetch should
  // throw Errors, but do not trust the shape).
  const { fetchImpl } = makeFakeFetch({});
  // Override to throw a string.
  const throwingFetch = (async () => {
    throw "string error";
  }) as unknown as typeof fetch;
  void fetchImpl; // keep the helper referenced for symmetry
  const result = await checkAuraReachable("https://aura.example/api", throwingFetch);
  assert.equal(result.reachable, false, "string throw is unreachable");
  assert.equal(result.reason, "string error", "non-Error reason is stringified");
}

console.log("checkAuraReachable (errors ⇒ unreachable): ok");

// ---------------------------------------------------------------------------
// checkAuraReachable — the probe never throws (always returns a result)
// ---------------------------------------------------------------------------

{
  // Even an unexpected synchronous throw from fetch is caught.
  const syncThrowFetch = (() => {
    throw new Error("sync boom");
  }) as unknown as typeof fetch;
  const result = await checkAuraReachable("https://aura.example/api", syncThrowFetch);
  assert.equal(result.reachable, false, "sync throw is unreachable");
  assert.equal(result.reason, "sync boom", "sync throw reason is captured");
}

console.log("checkAuraReachable (never throws): ok");

// ---------------------------------------------------------------------------
// checkAuraReachable — timeout via AbortController
// ---------------------------------------------------------------------------

{
  // A fetch that ignores the abort signal but resolves after the timeout
  // should still be reported unreachable because the probe aborts it. We
  // simulate a hanging server that never resolves: the probe's
  // AbortController fires at timeoutMs and the fetch rejects with an abort.
  const hangingFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    // Never resolve; only reject when the signal aborts (as the real fetch does).
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("The operation was aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
  }) as typeof fetch;
  const result = await checkAuraReachable(
    "https://aura.example/api",
    hangingFetch,
    20, // 20ms — short for the test
  );
  assert.equal(result.reachable, false, "a hanging server is unreachable");
  assert.ok(result.reason !== undefined, "timeout carries a reason");
}

console.log("checkAuraReachable (timeout): ok");

// ---------------------------------------------------------------------------
// formatUnreachableWarning
// ---------------------------------------------------------------------------

{
  // Reachable ⇒ null (happy path stays silent)
  assert.equal(
    formatUnreachableWarning({ reachable: true }),
    null,
    "reachable returns null",
  );
}

{
  // Unreachable ⇒ the fixed user-facing message naming the VPN.
  const msg = formatUnreachableWarning({ reachable: false, reason: "fetch failed" });
  assert.ok(msg !== null, "unreachable returns a message");
  assert.ok(
    typeof msg === "string" && msg.toLowerCase().includes("aura"),
    "message names Aura",
  );
  assert.ok(
    typeof msg === "string" && msg.toLowerCase().includes("vpn"),
    "message tells the user to activate the VPN",
  );
}

console.log("formatUnreachableWarning: ok");

console.log("\nall aura-health tests passed");
