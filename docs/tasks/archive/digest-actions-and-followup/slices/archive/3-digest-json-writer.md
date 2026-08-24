---
kind: slice
slug: digest-json-writer
title: Write the corrected digest to ~/.pi/aura/digest.json
task: ../task.md
mode: afk
size: m
blocked_by: [followup-working-on]
status: done
---

## End-to-end behavior

After `fetch` (or a new `write-dashboard` step), the full corrected digest —
including `actions[]` and `followup` — is written to
`~/.pi/aura/digest.json`, the stable path the detached server and listener
find by convention. The existing temp-dir `digest.json` (for
`render`/`save`/`diff`/`cleanup`) is unaffected.

## Acceptance criteria

- `aura-digest.ts`: add `DASHBOARD_DIGEST_PATH = join(homedir(), ".pi", "aura", "digest.json")` beside `LAST_DIGEST_PATH`.
- At the end of `fetch` (or a `write-dashboard` step the arch spec settles), write the corrected digest (with `actions[]` + `followup`) to `DASHBOARD_DIGEST_PATH`, creating `~/.pi/aura/` if missing.
- The temp-dir `digest.json` (the `$OUT/digest.json` `render`/`save`/`diff` read) is still written and unchanged.
- `make typecheck && make build` green; test that after `fetch`, `~/.pi/aura/digest.json` exists, parses, and its `actions`/`followup` match the temp-dir digest.
- `save` still writes `last-digest.json` (unchanged); `DASHBOARD_DIGEST_PATH` is a third file alongside it.

## Test plan

- **Seams:** the write call — use a temp `HOME` (or inject the path) so the test doesn't write to the real `~/.pi/aura/`.
- **Scenarios:** (a) `fetch` → `~/.pi/aura/digest.json` exists with `actions`+`followup`; (b) `~/.pi/aura/` created if absent; (c) re-running `fetch` overwrites (not appends); (d) temp-dir `digest.json` still present for `render`/`save`.
- **Failure modes:** write permission error → `fetch` reports it via `warnings[]` rather than crashing (mirror the keyring-skip graceful-degradation pattern).
- **Edge cases:** large `actions[]` — the file is bounded (≤6 actions), no streaming needed.
- **Integration:** `diff` (which reads `last-digest.json`) is unaffected.

## Constraints and dependencies

- `blocked_by: [followup-working-on]` (needs the complete `Digest` shape).
- Do not start a server or open a browser — that's `digest-dashboard`.
- The arch spec decides whether the dashboard write is inline in `fetch` or a new `write-dashboard` subcommand; either is acceptable as long as it's one call from the SKILL.md flow.
