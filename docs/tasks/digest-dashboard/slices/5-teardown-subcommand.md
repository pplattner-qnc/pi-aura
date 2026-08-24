---
kind: slice
slug: teardown-subcommand
title: Implement the /digest-dashboard stop teardown (kill PID + delete state.json + listener exits)
task: ../task.md
mode: afk
size: s
blocked_by: [state-listener]
---

## End-to-end behavior

`/digest-dashboard stop` reads `~/.pi/aura/state.json`, kills the recorded
server PID, deletes `state.json` (the listener observes the deletion and
exits), and confirms cleanup. Graceful when the file/PID is already gone.

## Acceptance criteria

- `index.ts` `stop` handler: read `~/.pi/aura/state.json`; if present, parse `pid`; `process.kill(pid)` (SIGTERM; escalate to SIGKILL after a short timeout if still alive); delete `state.json`; notify "Digest dashboard stopped."
- If `state.json` absent → notify "No dashboard running." (idempotent, no error).
- If the PID is already dead (`ESRCH`) → delete `state.json` + notify (no throw).
- `session_shutdown` cleanup: if a server PID is recorded, kill it + delete `state.json` (don't leak a detached server when pi exits) — mirror pi-annotate's `session_shutdown` `liveServers` cleanup.
- The listener (from `state-listener`) observes `state.json` deletion and exits on its own — this slice just deletes the file.
- Unit tests: stop with a live fake-PID (spawn a sleep child, record its PID) → killed + file deleted; stop with no file → idempotent; stop with dead PID → file deleted, no throw.

## Test plan

- **Seams:** `stop` with a temp `HOME` + a spawned `sleep` child as the fake server PID.
- **Scenarios:** (a) `state.json` with a live PID → child killed, file deleted, "stopped" notify; (b) no `state.json` → "No dashboard running", exit 0; (c) `state.json` with a dead PID → file deleted, no throw; (d) `session_shutdown` with a leaked PID → killed.
- **Failure modes:** `process.kill` permission error → notify error, still attempt file delete.
- **Edge cases:** PID reused by another process (rare) — `process.kill` would hit the wrong process; mitigate by recording `server_started` timestamp in `state.json` and only killing if it matches (arch spec may add this guard).

## Constraints and dependencies

- `blocked_by: [state-listener]` (the listener's delete-exit contract must be in place to verify teardown).
- `state.json` shape includes `pid` (from `wire-extension-entry`'s `start`); this slice reads it.
