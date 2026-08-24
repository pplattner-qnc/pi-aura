# Testing

The repo has two build targets with their own gates: the `scripts/` esbuild
project (bundles `.mjs` for the skills) and the `@pi-aura/shared` workspace
package (`.ts` sources consumed by both `scripts/` and the pi extension).
Verification is typecheck + build + the shared package's unit tests.

## Framework

- `scripts/`: `tsc --noEmit` + esbuild bundle (no test runner).
- `packages/shared/`: `tsc --noEmit` + `tsx --test` (Node's built-in test
  runner via `tsx` for `.ts` sources). Tests live in `packages/shared/test/`.

## Run commands

```bash
# Root (workspaces root): one install populates scripts/ + packages/shared/
npm install

# packages/shared — the AuraClient interface, HeyApiAuraClient impl, keyring, settings
cd packages/shared
npm run codegen        # regenerate src/generated/ from openapi/openapi.yaml
npm run typecheck      # tsc --noEmit
npm test               # tsx --test test/*.test.ts

# scripts — the skill bundles
npm run codegen        # regenerate src/generated/ from openapi/openapi.yaml (legacy tree; moved to packages/shared)
npm run typecheck      # tsc --noEmit
npm run build          # esbuild -> skills/*/dist/*.mjs

# Makefile wrappers (require `make` on PATH; not available on NixOS — use npm directly):
make install          # root npm install
make codegen          # cd packages/shared && npm run codegen
make gen              # codegen + typecheck + build
make build            # typecheck + bundle
```

## Mock conventions

- Inject a fake `Keyring` (returns a test PAT) over hitting the real OS
  keyring — see `packages/shared/test/hey-api-aura-client.test.ts`.
- Inject a fake generated SDK / `createClient` over hitting real Aura for
  `HeyApiAuraClient` mapping tests; assert the domain<->generated mapping
  without network calls.
- The `AuraClient` interface is implementation-agnostic; `aura.ts` and
  `aura-digest.ts` now consume `createDefaultAuraClient()` from
  `@pi-aura/shared/aura-client` and should be unit-tested by injecting a fake
  `AuraClient` rather than the real `HeyApiAuraClient`.
- The scripts' esbuild bundle marks `@napi-rs/keyring`,
  `@napi-rs/keyring-linux-x64-gnu`, and `dbus-next` as `external` (native
  binding / optional `x11` require that can't bundle). Any new native-ish dep
  pulled in transitively via `@pi-aura/shared` must be added to
  `scripts/esbuild.config.mjs`'s `external` array or the bundle breaks.

## `scripts/src/engineering-sync.test.ts`

A logic-only unit test for the sync utility's pure helpers (`suffixed`,
`hasSuffix`, `consumeIgnoreTombstones`, stem matching). It imports from
`./engineering-sync.ts`, which in turn re-exports from `@pi-aura/shared`.

**Run it with `tsx`, not `node --experimental-strip-types`:**

```bash
node_modules/.bin/tsx scripts/src/engineering-sync.test.ts
```

`node --experimental-strip-types` fails with `ERR_MODULE_NOT_FOUND` for
`packages/shared/src/hey-api-aura-client.js` because the `.ts` sources
re-export with a `.js` extension that the raw-node strip-types loader cannot
resolve through the workspace package boundary. `tsx` resolves it correctly.
This is a pre-existing `@pi-aura/shared` module-resolution issue, not a test
logic failure — all 5 sub-tests pass under `tsx`.

## `scripts/src/{build-actions,followup-working-on,write-dashboard-digest}.test.ts`

Pure-logic unit tests for the digest data half (the `actions[]` routing table,
the `followup.currentlyWorkingOn` default, the `~/.pi/aura/digest.json`
write). They import only `./types.ts` + the helper under test — no
`@pi-aura/shared` boundary — so `node --experimental-strip-types` works
(the `.js`-extension issue that forces `tsx` for `engineering-sync.test.ts`
does not apply here).

```bash
node --experimental-strip-types scripts/src/build-actions.test.ts
node --experimental-strip-types scripts/src/followup-working-on.test.ts
node --experimental-strip-types scripts/src/write-dashboard-digest.test.ts
```

## `.pi/extensions/digest-dashboard/` (vitest)

The interactive digest-dashboard extension (Svelte SPA + dumb file server +
`state.json` listener + teardown) has a vitest suite at `test/digest-dashboard/`
(`Digest.test.ts`, `server.test.ts`, `state.test.ts`, `listener.test.ts`,
`teardown.test.ts`, `start.test.ts`; ~42 tests) using `happy-dom` for the
component. Config: `vitest.config.ts` at repo root. devDeps (`svelte`, `vite`,
`@sveltejs/vite-plugin-svelte`, `vitest`, `happy-dom`) are at the root
`package.json` (the sub-package `package.json` is a marker with no deps;
Vite resolves via walk-up to root `node_modules`).

```bash
npx vitest run                              # all digest-dashboard tests
cd .pi/extensions/digest-dashboard && npm run build    # vite (app.js) + esbuild (server.mjs)
cd .pi/extensions/digest-dashboard && npm run typecheck
```

The extension ships only committed `dist/` (`app.js`, `app.css`, `server.mjs`)
— zero runtime npm deps for end users. `index.ts` + `listener.ts` are loaded
by pi's jiti at runtime (not bundled); `server.ts` is esbuild-bundled to
`dist/server.mjs` (the detached entry `spawn` runs).

### Real-data-shaped fixtures (the stuck-loading regression)

`test/digest-dashboard/real-data-load.test.ts` exists because the small
`live/digest.json` fixture never triggered the bug that stuck the dashboard on
"Loading…" with real Aura data. The real `~/.pi/aura/digest.json` had a
**duplicate task key** (`AURA-742` twice in `attention.waiting_on_others`),
which made Svelte 5's keyed `{#each … (item.key)}` throw `each_key_duplicate`,
aborting the render so `loading` never flipped to `false`.

Lesson for future dashboard tests: mirror the **real** `~/.pi/aura/digest.json`
shape + size (3 actions, 9 queue rows, 2 reviews, 9 `dev_links`, 6
`older_unread`, 1 warning, AND any duplicate keys the real data has), mock
`fetch("/api/digest")` with a small `setTimeout` delay (instant-resolve mocks
don't reproduce the timing), and mock `EventSource` with the `FakeEventSource`
pattern so the SSE `$effect` doesn't re-fire and race the initial load. Small,
clean fixtures render fine and hide the real-data crash. Read-only
attention lists are now keyed by index `(i)` (not `item.key`) since they need
no identity reconciliation.

### `/digest` command + digest-fetch/save tools

`test/digest-dashboard/slash-command.test.ts` tests the `/digest` extension
command handler with a fake `pi` (captures `setActiveTools` + `sendMessage`).
`test/digest-dashboard/fetch-save-tools.test.ts` tests the `digest-fetch` +
`digest-save` tools with a mocked `child_process.spawn` (no real Aura). The
tools are thin wrappers over `aura-digest.mjs` (D5: the `.mjs` stays the single
source of truth). The digest tools (`digest-dashboard-start`,
`digest-dashboard-stop`, `digest-fetch`, `digest-save`) are registered but
**inactive by default** — the `session_start` handler filters `DIGEST_TOOLS` out
of the active set; `/digest` activates them additively.
