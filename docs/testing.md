# Testing

The repo has two build targets with their own gates: the `scripts/` esbuild
project (bundles `aura.mjs` for the `aura` skill) and the `@pi-aura/shared`
workspace package (`.ts` sources consumed by both `scripts/` and the pi
extension). Verification is typecheck + build + the shared package's unit tests.

## Framework

- `scripts/`: `tsc --noEmit` + esbuild bundle for `aura.mjs` (no test runner).
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

# scripts — the aura skill bundle
npm run codegen        # regenerate src/generated/ from openapi/openapi.yaml (legacy tree; moved to packages/shared)
npm run typecheck      # tsc --noEmit
npm run build          # esbuild -> skills/core/aura/dist/aura.mjs

# Taskfile wrappers (run from the repo root; requires `task` on PATH —
# https://taskfile.dev; not available on NixOS by default — use npm directly
# as shown above):
task install          # root npm install
task codegen          # cd packages/shared && npm run codegen
task gen              # codegen + typecheck + build
task build            # typecheck + bundle
task openapi-sync     # refresh packages/shared/openapi/openapi.yaml from the Aura repo
```

## Mock conventions

- Inject a fake `Keyring` (returns a test PAT) over hitting the real OS
  keyring — see `packages/shared/test/hey-api-aura-client.test.ts`. A
  `FakeKeyring` implementing the `Keyring` interface is the standard seam for
  tests under `test/<task-slug>/` (see `test/atlassian-keyring-auth/`); assert
  constructed auth headers, not live network calls.
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
- **Generated SDK imports need `.js` extensions under NodeNext** (the
  `tsConfigPath` lesson). The generated client in `packages/shared/src/generated/`
  is consumed by BOTH `scripts/` (`moduleResolution: bundler`) and the
  `digest-dashboard` extension (`moduleResolution: NodeNext`). Under NodeNext,
  relative import specifiers MUST carry a `.js` extension or `tsc` fails with
  TS2307/TS2834. `@hey-api/openapi-ts` (v0.67+) auto-appends `.js` to generated
  relative imports when the resolved `output.tsConfigPath` tsconfig has
  `moduleResolution: "nodenext"`. `packages/shared/openapi-ts.config.ts` points
  `tsConfigPath` at `packages/shared/tsconfig.codegen.json` (a tiny NodeNext
  tsconfig), so `npm run codegen` emits the `.js` extensions natively — the
  generated tree is correct out-of-the-box and survives regeneration. **Do NOT
  hand-patch `.js` extensions onto generated files** (a prior attempt did;
  the next codegen run wiped them). `tsConfigPath` is resolved relative to the
  openapi-ts package dir, not the config file, so it must be an absolute path
  (the config derives it from `import.meta.url`). `.js`-extended specifiers
  also resolve under `bundler`, so the shared package's own `tsc --noEmit` is
  unaffected.

## `packages/shared/test/digest/{build-actions,scheduler,fetchAction,drop-dead-shared-exports}.test.ts`

Pure-logic unit tests for the digest data half (the `actions[]` routing table,
the `followup.currentlyWorkingOn` default, the scheduler reducer, and the
`fetchAction` in-process path). These moved out of `scripts/src/` when the
digest core moved into `@pi-aura/shared` (task `core-move`); they now live under
`packages/shared/test/digest/` and run under the shared package's `tsx --test`
runner (Node's built-in test runner via `tsx`). The `scheduler` test was
converted from vitest to `node:test` + `node:assert` to match the shared
package's convention. They import the digest core via the package path
(`@pi-aura/shared/digest/...`) or intra-package relative imports. The
`drop-dead-shared-exports.test.ts` is a structural guard asserting the CLI-era
exports (progress-emitter, write-dashboard-digest, render/save/diff/cleanup/last
actions) are gone.

```bash
cd packages/shared
npx tsx --test test/digest/build-actions.test.ts
npx tsx --test test/digest/scheduler.test.ts
npx tsx --test test/digest/fetchAction.test.ts
npx tsx --test test/digest/drop-dead-shared-exports.test.ts
# or all shared tests: npm test
```

## `scripts/src/{rest-list-describe,rest-call,rest-search,...}.test.ts` (the `rest` CLI)

The `rest` command group (`aura.mjs rest list/describe/call/search`) added a
family of unit tests under `scripts/src/`. These run with **`node
--experimental-strip-types`** (like the digest tests above), NOT vitest.

```bash
node --experimental-strip-types --test scripts/src/rest-list-describe.test.ts
node --experimental-strip-types --test scripts/src/rest-call.test.ts
node --experimental-strip-types --test scripts/src/rest-search.test.ts
node --experimental-strip-types --test scripts/src/gen-rest-index.test.ts
# (and rest-search-local, gen-rest-index-local, gen-rest-index-embed, rest-code-tags, gen-rest-doc)
```

Two runner-discipline lessons (hard-won, from the `generic-openapi-cli-wrapper`
task):

1. **Use `node --experimental-strip-types` for `scripts/src` CLI tests, not
   `tsx`.** `tsx` resolves `.js`→`.ts` sibling imports transitively, which can
   *mask* a failure that `node --experimental-strip-types` (the documented
   runner for these suites) exposes: a source file importing a sibling
   **value** module with a `.js` extension breaks under
   `--experimental-strip-types` (it can't rewrite `.js`→`.ts` for value
   imports). If a `scripts/src` source needs a shared value module, import it
   via the **package path** (`@pi-aura/shared/rest/closest-match`), not a
   sibling `.js` — the package path resolves under both runners. `import type`
   with `.js` is fine (erased at runtime).
2. **The digest-core vitest suites moved to `packages/shared`.** The
   `scheduler.test.ts` that used to live in `scripts/src/` and run under
   vitest moved to `packages/shared/test/digest/` with the digest core (task
   `core-move`) and was converted to `node:test` + `node:assert` to match the
   shared package's `tsx --test` convention. `vitest.config.ts`'s `include` no
   longer references it — it's just `["test/**/*.test.ts"]` now. Run it with
   `cd packages/shared && npm test` (or `npx tsx --test
   test/digest/<suite>.test.ts`), NOT `npx vitest run`. (The
   `aura-digest-progress.test.ts` was deleted in task `cli-deletion-and-rewire`
   — the progress-emitter module it tested is gone.)

### Mock-fidelity for external-library integration (the `_embedRaw` lesson)

The local-embeddings provider mocks `@huggingface/transformers`' `pipeline`.
The first implementation's mock returned the WRONG output shape (an array of
per-text tensors) while the real `pipeline(..., {pooling:'mean', normalize:true})`
returns a **single `Tensor`** with `dims=[N, hiddenDim]` and flat `data`. All
unit tests passed against the wrong-shaped mock; the real `task gen-rest-index`
build crashed (`quantizeToInt8(undefined)`). A mock whose shape doesn't match
the real library's output is worse than no test — it gives false confidence.
For external-library integration: **record the real output shape in the test**
(the `local-provider.test.ts` now asserts a single `{data, dims:[N,384]}`
tensor against a 2- and 3-text batch, with an off-by-one guard), and run a real
end-to-end gate (the actual `task gen-rest-index` with the cached model) — not
just mocked unit tests — before declaring the slice done.


The interactive digest-dashboard extension (Svelte SPA + in-process HTTP
server + in-memory event stream + teardown) has a vitest suite at
`test/digest-dashboard/` (`Digest.test.ts`, `server.test.ts`, `state.test.ts`,
`listener.test.ts`, `teardown.test.ts`, `start.test.ts`, plus
`dead-code-sweep.test.ts`; ~200 tests) using `happy-dom` for the component.
Config: `vitest.config.ts` at repo root. devDeps (`svelte`, `vite`,
`@sveltejs/vite-plugin-svelte`, `vitest`, `happy-dom`) are at the root
`package.json` (the sub-package `package.json` is a marker with no deps;
Vite resolves via walk-up to root `node_modules`).

The server runs **in-process** (task `in-process-server`): `index.ts` holds a
module-scope `serverHandle` and imports `startServer` from `./server.ts`
directly — no spawned child, no `server-url.json`, no `state.json` pid. The
backing is an in-memory `store.ts` (`currentDigest`/`events`/`sseClients`/
`pushEvent`/`subscribe`/`setCurrentDigest`). `teardownDashboard` calls
`server.closeAllConnections()` + `server.close()` (so SSE keep-alive tabs don't
hang teardown) then `resetStore()`. The build is **vite-only** — there is no
`dist/server.mjs` and no esbuild config in the extension anymore.

```bash
npx vitest run                              # all digest-dashboard tests
cd .pi/extensions/digest-dashboard && npm run build    # vite only (app.js + app.css); no server.mjs
cd .pi/extensions/digest-dashboard && npm run typecheck
```

The extension ships only committed `dist/` (`app.js`, `app.css`) — zero
runtime npm deps for end users. `index.ts` + `listener.ts` + `server.ts` +
`store.ts` are loaded by pi's jiti at runtime (not bundled); the Svelte SPA
is Vite-built to `dist/app.js` + `dist/app.css`.

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
`digest-finalize` tools with a mocked `child_process.spawn` (no real Aura). The
`digest-fetch` tool calls `fetchAction` from `@pi-aura/shared/digest/aura-digest`
in-process (no spawned child, no CLI bundle); `digest-finalize` calls `saveLastDigest`.
The digest tools (`digest-dashboard-start`, `digest-dashboard-stop`,
`digest-fetch`, `digest-finalize`) are registered but **inactive by default** — the
`session_start` handler filters `DIGEST_TOOLS` out of the active set; `/digest`
activates them additively.

### `digest-log` tool + progress events (digest-live-progress-tree)

The `digest-log` pi tool (`index.ts`) POSTs `agent→page` events to the in-memory store's `pushEvent` (no spawned child, no CLI bundle). The server's `appendEvent` assigns the monotonic `id` (clients send `id: 0` as a placeholder). Tests mock `fetch` and assert the POST body, not a live server. (The old `scripts/src/progress-emitter.ts` batching module was deleted in task `cli-deletion-and-rewire` — the in-process `digest-fetch` uses `store.pushEvent` directly, and the `digest-log` tool posts individual lines.)

### `createDwellManager` + the 400ms render dwell (digest-live-progress-tree)

`progressTree.ts` exports a pure `createDwellManager(dwellMs, onExpire?)` (no DOM/Svelte dependency) so the dwell logic is unit-testable in `test/digest-dashboard/progressTree.test.ts`. `Digest.svelte` wires it via a reactive `dwellVersion = $state(0)` counter bumped by `onExpire`; `statusIcon()` is a **pure** render function that reads `dwellVersion` + calls `dwell.displayStatus` (no mutation during render). The dwell **observation** (`dwell.observe()`) runs in a `$effect.pre` (not `$effect`) — `$effect` runs after the DOM update, too late for the first post-transition render; `$effect.pre` runs before it, preserving the 400ms hold on a fast running→done pair. The component test (`DigestTree.test.ts`) uses `vi.useFakeTimers()` and advances time to verify the spinner holds ~400ms then flips to ✓. A node already terminal on first mount (no observed transition) renders the icon immediately — no dwell.

## Guided Atlassian PAT provisioning (`extensions/atlassian-provision.ts`)

The guided `/aura secrets edit` walkthrough + the per-token access probes live
in a sibling module `extensions/atlassian-provision.ts` (split from
`aura-secrets.ts` to keep both focused; see the code-quality rule's "split
proactively" guidance).

- **Probe helpers are the one place live network calls are legitimate at
  runtime**, but unit tests must mock them. `probeTeamworkGraph` takes an
  injectable `clientFactory: () => Promise<McpProbeClient>` (a minimal seam
  interface decoupled from the real `McpClient`); `probeBitbucket` takes an
  injectable `fetchImpl`. Tests pass a fake `McpProbeClient` / fake `fetch` and
  assert the right endpoint + Basic header — never a live call.
- **`parseWalkthrough(markdown)`** is a pure helper that extracts the two
  sequences (app + scopes + steps) from `docs/atlassian-api-token-walkthrough.md`
  at run time. Unit-test it against a fixture doc (and an integration test
  against the real doc) — no pi session or network needed.
- **`runGuidedWalkthrough`** is tested by injecting fake probe functions
  (`ProbeFunctions`) so the orchestrator's step sequencing is verified without
  the network. Atomicity (cancel mid-guided → no partial keyring write) is
  asserted the same way as the combined edit flow.
