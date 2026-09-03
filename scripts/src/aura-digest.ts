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

import {
  fetchAction,
  renderAction,
  saveAction,
  diffAction,
  cleanupAction,
  lastAction,
  USAGE,
  FailError,
} from "@pi-aura/shared/digest/aura-digest";

async function main(): Promise<void> {
  const action = process.argv[2];
  switch (action) {
    case "fetch":
      await fetchAction();
      return;
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
