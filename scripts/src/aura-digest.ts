// aura-digest.ts — thin CLI shim.
//
// The digest core (fetchAction, renderAction, saveAction, diffAction,
// cleanupAction, lastAction, USAGE, FailError) now lives in
// @pi-aura/shared/digest/aura-digest. This file is the CLI entry point:
// it dispatches on process.argv and catches FailError to preserve the
// original exit codes (2 for unknown/missing action, 1 for no-last-digest).
// Task 5 deletes this shim (and the CLI bundle).
//
// Usage:
//   node dist/aura-digest.mjs fetch                 Create a random /tmp/aura-morning-<hex>/
//                                            dir, fetch all Aura data (+ verify review
//                                            states), write raw.json + digest.json +
//                                            report.json, print "output directory:
//                                            <path>/" to stdout.
//   node dist/aura-digest.mjs render <dir>          Read <dir>/digest.json and write the
//                                            rendered markdown to stdout.
//   node dist/aura-digest.mjs render <dir> <out>     Write the rendered markdown to <out>
//                                            instead of stdout.
//   node dist/aura-digest.mjs cleanup <dir>         Delete <dir> and its contents.
//   node dist/aura-digest.mjs save <dir>            Save <dir>/digest.json as the last
//                                            presented digest (~/.pi/aura/last-digest.json).
//   node dist/aura-digest.mjs diff <dir>            Print (JSON) what changed since the last
//                                            saved digest.
//   node dist/aura-digest.mjs last                  Print the last saved digest (JSON).

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  fetchAction,
  renderAction,
  saveAction,
  diffAction,
  cleanupAction,
  lastAction,
  USAGE,
  FailError,
  DASHBOARD_DIGEST_PATH,
} from "@pi-aura/shared/digest/aura-digest";
import { createProgressEmitter, readDashboardUrl } from "@pi-aura/shared/digest/progress-emitter";
import { writeDashboardDigest } from "@pi-aura/shared/digest/write-dashboard-digest";

async function main(): Promise<void> {
  const action = process.argv[2];
  switch (action) {
    case "fetch": {
      // The CLI owns the file-writing that fetchAction used to do.
      // fetchAction is now a pure function returning {digest, report, raw}.
      const outDir = join(tmpdir(), `aura-morning-${randomBytes(6).toString("hex")}`);
      mkdirSync(outDir, { recursive: true });

      // Live progress tree: the CLI shim constructs the progress emitter
      // (fetchAction no longer calls readDashboardUrl/createProgressEmitter).
      const dashboardUrl = readDashboardUrl();
      const progressHook = createProgressEmitter(dashboardUrl);

      const r = await fetchAction({ onProgress: progressHook });
      const { digest, report, raw } = r;

      const rawPath = resolve(outDir, "raw.json");
      const digestPath = resolve(outDir, "digest.json");
      const reportPath = resolve(outDir, "report.json");

      // Fill in the file paths the pure function left blank.
      digest.meta.raw_path = rawPath;
      digest.meta.report_path = reportPath;
      report.raw_path = rawPath;

      writeFileSync(rawPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
      writeFileSync(digestPath, JSON.stringify(digest, null, 2) + "\n", "utf8");
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

      // Write the full corrected digest to the stable dashboard path.
      // Failure is non-fatal: the temp-dir digest is the source of truth for
      // render/save/diff, and the dashboard file is a best-effort SPA data source.
      try {
        writeDashboardDigest(digest, DASHBOARD_DIGEST_PATH);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        digest.warnings.push(`Could not write dashboard digest to ${DASHBOARD_DIGEST_PATH}: ${message}`);
      }

      // Flush any remaining progress events (inline phase nodes) at the very end.
      await progressHook.flush();
      console.log(`output directory: ${outDir}/`);
      console.error(`fetched ${report.fetched_at}`);
      console.error(`  raw:     ${rawPath}`);
      console.error(`  digest:  ${digestPath}`);
      console.error(`  report:  ${reportPath}`);
      console.error(`  queue rows: ${digest.queue.length}, artifacts verified: ${report.verifications.length} (${report.verifications.filter((v) => v.stale).length} stale), dev links: ${digest.dev_links.length} tasks`);
      return;
    }
    case "render":
      renderAction();
      return;
    case "cleanup":
      cleanupAction();
      return;
    case "save":
      saveAction();
      return;
    case "diff":
      diffAction();
      return;
    case "last":
      lastAction();
      return;
    default:
      throw new FailError(
        action ? `unknown action: ${action}` : "missing action",
        USAGE,
      );
  }
}

main().catch((e: unknown) => {
  if (e instanceof FailError) {
    console.error(e.message);
    if (e.usage) console.error(e.usage);
    process.exit(e.code);
  }
  console.error("aura failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
