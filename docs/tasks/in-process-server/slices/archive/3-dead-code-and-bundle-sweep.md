---
kind: slice
slug: dead-code-and-bundle-sweep
title: Delete the server bundle + esbuild config + dead state.ts file functions
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: [backing-in-memory]
---

## End-to-end behavior

No behavior change (the dashboard is already in-process + in-memory from
slices 1–2). This slice deletes the now-dead artifacts: the `dist/server.mjs`
bundle, the extension's `esbuild.config.mjs` (the *server* bundle config),
and the dead file-based functions in `state.ts` (`writePid`/`clearPid`/
`readState`/file `appendEvent` + the `StateFile.pid`/`server_started` fields).
`npm run build` becomes vite-only (`app.js`/`app.css`); the extension loads
`server.ts` from source in-process.

## What this slice delivers

- `server.ts`: delete the self-run entry block (the `if (invokedPath ===
  modulePath)` block + signal/exit cleanup + `defaultAuraPaths` if now unused).
  `server.ts` is a pure library module exporting `startServer` + `openBrowser`.
- Delete `dist/server.mjs` + `.pi/extensions/digest-dashboard/esbuild.config.mjs`
  (the server bundle config — NOT `scripts/esbuild.config.mjs`, which task 5
  deletes). Update `package.json` `build`: `vite build && node esbuild.config.mjs`
  → `vite build`. Update `.gitignore` if it referenced `dist/server.mjs`
  (the `.pi/extensions/digest-dashboard/.gitignore` may keep `dist/**` minus
  the app bundles).
- `state.ts`: delete `writePid`, `clearPid`, `readState` (if unused), the
  file-write `appendEvent`, the `EMPTY_STATE.pid`/`server_started` fields. Keep
  the `StateEvent` type (still used). The `StateFile` interface shrinks to
  just `events` (or is removed if events are purely in-memory).
- Remove the `clearPid`/`writePid` import from `index.ts` if still imported.
- `digest-types.ts`: no change (the Svelte types are browser-side; unaffected).
- Confirm `npm run build` (vite only) + `npm run typecheck` pass; the
  extension is loaded by `pi.extensions` → `./index.ts` (not a bundle).

## Acceptance criteria

- No `dist/server.mjs`; no `esbuild.config.mjs` in the extension; `npm run
  build` is vite-only and produces `dist/app.js` + `dist/app.css`.
- No `writePid`/`clearPid`/file `appendEvent`/`readState`/`server-url.json`
  references remain; grep clean.
- `server.ts` has no self-run entry block (no `process.argv[1]` check).
- Full vitest + all three typechecks + `npm run build` (vite) green.

## Test plan

- Grep: no `server-url.json`, `writePid`, `clearPid`, `terminateProcess`,
  `waitForServerUrl`, `resolveServerEntryPath` references remain anywhere.
- `npm run build` (extension) builds only `app.js`/`app.css` (no `server.mjs`).
- Full vitest + typecheck green; the dashboard still starts/stops/serves.

## Constraints and dependencies

- Blocked by slice 2 (backing must be in-memory before the file functions are dead).
- Do NOT delete `scripts/esbuild.config.mjs` or the `aura-digest` CLI bundle (task 5).
- Do NOT change the Svelte view or digest types.
