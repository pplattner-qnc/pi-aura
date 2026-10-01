/**
 * Aura reachability probe extension.
 *
 * One concern: a quick, non-blocking probe fired on `session_start`. It
 * HEADs the Aura REST base URL with a short timeout and, when the server is
 * unreachable (network / DNS / TLS / timeout, typically because the VPN that
 * exposes the private Aura instance is down), warns the user to activate
 * the VPN. Any HTTP response counts as reachable; auth/routing problems
 * are out of scope. Non-blocking: never rejects into the session-start
 * handler.
 *
 * History: this extension used to own the whole `@AURA-<number>` overlay
 * (autocomplete, inline expansion to `<aura-task>`, the task-reference
 * system-prompt instruction) alongside the probe. The
 * unified-reference-mentions effort moved that handling into the shared
 * reference engine (extensions/aura-references.ts) as its first registered
 * legacy alias: `@AURA-42` still autocompletes and still expands, now to the
 * uniform `<task-ref>` tag and with a once-per-session deprecation warning,
 * all owned by the engine. The switch was atomic (registration + deletion in
 * one landing), so no state ever existed where both paths transformed the
 * same mention. What is left here, the probe, is unrelated to references
 * and stays registered in the package manifest.
 *
 * Tests: the probe's pure logic (checkAuraReachable, formatUnreachableWarning)
 * is covered in extensions/aura-health.test.ts; the module surface and the
 * factory export are pinned in extensions/aura-tasks.test.ts. Run with:
 *
 *   node --experimental-strip-types extensions/aura-tasks.test.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Aura reachability check (session-start VPN-offline warning)
// ---------------------------------------------------------------------------
// A quick, non-blocking probe fired on `session_start`. It GETs the Aura
// REST base URL with a short timeout: any HTTP response (even 401/404) means
// the server is reachable; only a network / DNS / TLS / timeout error means
// Aura is unreachable — typically because the VPN that exposes the private
// Aura instance is down. The probe never throws into the session; a failure
// only surfaces as a `warning` notify so the user knows to activate the VPN.

/** Abort the reachability probe after this many milliseconds. Short, because
 *  the point is to detect an offline network quickly, not to wait out a slow
 *  but reachable server. */
const AURA_REACHABILITY_TIMEOUT_MS = 5_000;

/** Result of a reachability probe. `reachable: false` always carries a
 *  short human-readable `reason` (the underlying error message) used only
 *  for the debug detail line; the user-facing message is fixed. */
export interface AuraReachabilityResult {
  reachable: boolean;
  reason?: string;
}

/** Probe the Aura REST base URL once. Returns `{ reachable: true }` for any
 *  HTTP response (the server answered, so the network path is up — auth and
 *  routing are separate concerns), or `{ reachable: false, reason }` for a
 *  network / DNS / TLS / timeout / abort error.
 *
 *  Pure of pi: takes a URL and an injectable `fetchImpl` (defaults to the
 *  global `fetch`) so it is unit-testable without a pi session or network.
 *  The URL is a required argument rather than read from settings here, so
 *  the caller owns the "missing baseUrl ⇒ skip" decision. */
export async function checkAuraReachable(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = AURA_REACHABILITY_TIMEOUT_MS,
): Promise<AuraReachabilityResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // A HEAD request is enough to confirm reachability and avoids pulling a
    // response body. Some servers reject HEAD on the base path; a 4xx/5xx is
    // still a successful reachability signal, so we do not retry with GET.
    const res = await fetchImpl(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "error",
    });
    // Any HTTP status — even 401/404/5xx — means the server answered, so the
    // network path to Aura is up. Auth/routing problems are out of scope here.
    void res.status;
    return { reachable: true };
  } catch (err) {
    return {
      reachable: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The user-facing message shown when Aura is unreachable. One line, names
 *  the most likely cause (the VPN that exposes the private Aura instance) so
 *  the user has an actionable next step. */
const AURA_UNREACHABLE_MESSAGE =
  "Aura is not reachable — please activate your VPN and retry.";

/** Format the warning message for `ctx.ui.notify`. When Aura is reachable
 *  (or there is no base URL to probe), returns `null` so the caller can skip
 *  the notify entirely — the happy path stays silent. Exported for unit tests
 *  so the exact wording is pinned. */
export function formatUnreachableWarning(result: AuraReachabilityResult): string | null {
  if (result.reachable) return null;
  return AURA_UNREACHABLE_MESSAGE;
}

// ---------------------------------------------------------------------------
// Extension factory (the probe wiring only)
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    // Fire-and-forget reachability probe. Detects the common "VPN is off so
    // the private Aura instance is unreachable" state at session start and
    // warns the user once; never blocks the session.
    // Dynamic import: @pi-aura/shared/settings imports only node builtins, but
    // we keep the dynamic-import seam consistent with the rest of the package
    // (the shared client/keyring modules are dynamic-imported the same way) so
    // the unit-test entry point stays free of any pi-session dependency.
    void (async () => {
      let baseUrl: string | undefined;
      try {
        const { loadAuraClientSettings } = await import("@pi-aura/shared/settings");
        baseUrl = loadAuraClientSettings().baseUrl;
      } catch {
        // Settings file missing/unparseable — nothing to probe; stay silent.
        return;
      }
      if (!baseUrl) return; // no configured base URL — stay silent

      const result = await checkAuraReachable(baseUrl);
      const message = formatUnreachableWarning(result);
      if (message) ctx.ui.notify(message, "warning");
    })().catch(() => {
      // The probe itself never throws (checkAuraReachable catches), but guard
      // the dynamic import + notify path so a session-start handler can never
      // reject into the session.
    });
  });
}
