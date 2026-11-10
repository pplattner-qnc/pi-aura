# Testing

The repo has one TypeScript package with its own gates: the `@pi-aura/shared`
workspace package (`.ts` sources consumed by the pi extension). Verification
is typecheck + the shared package's unit tests. The pi extensions carry
per-file strip-types suites beside their sources; there is no build step.

## Framework

- `packages/shared/`: `tsc --noEmit` + `tsx --test` (Node's built-in test
  runner via `tsx` for `.ts` sources). Tests live in `packages/shared/test/`.
- `extensions/`: per-file suites run with `node --experimental-strip-types`
  (no configured runner).
- Repo root: no test runner and no test tree; the per-package runner
  convention stands.

## Run commands

```bash
# Root (workspaces root): one install populates packages/shared/
npm install

# packages/shared: the keyring, settings, and embed modules the extensions
# resolve at runtime; the guards live in test/guards/
cd packages/shared
npm run typecheck      # tsc --noEmit
npm test               # tsx --test 'test/**/*.test.ts'

# Taskfile wrappers (run from the repo root; requires `task` on PATH,
# https://taskfile.dev, not available on NixOS by default; use npm directly
# as shown above):
task install          # root npm install
task typecheck        # cd packages/shared && npm run typecheck
```

## Test protocol

The task-workflow `test-runner` agent reads this section. "Run these
always" commands run on every suite gate; a "run if asked" command runs
only when the caller passes its number. Commands run from the repo root
with `bash` and a nonzero exit is a failure; the Run commands section
above stays the general reference. The always set is the verification
the effort gates ran: the shared package's runner, the per-file
extension strip-types suites, and the Taskfile typecheck gate.

Run these always:

- `cd packages/shared && npm test` -- the shared package's runner suite,
  guards included (the manifest's test script globs `test/**/*.test.ts`,
  so `test/guards/no-remnants.test.ts` runs with the rest)
- `for f in extensions/*.test.ts; do node --experimental-strip-types "$f" || exit 1; done` -- the extension logic suites, one process per
  file (the per-file strip-types runner; no configured extension runner)
- `task typecheck` -- `tsc --noEmit` over `packages/shared`

Run if asked (by number):

1. `node --experimental-strip-types extensions/aura-reference-cache.test.ts` -- the cross-process WAL concurrency driver standalone:
   child processes race the same WAL file while the parent asserts exit
   codes, landed rows, and `PRAGMA integrity_check` (the extension loop
   above runs this suite; this item isolates it when the
   concurrency gate is what was asked for)

A single suite, for manual use only (not part of the gated protocol): run
any one file with its documented per-file runner; the family sections
below list the exact commands.

## Mock conventions

- Inject a fake `Keyring` (returns a test PAT) over hitting the real OS
  keyring. A `FakeKeyring` implementing the `Keyring` interface is the
  standard seam; the credential loader's suite uses it (see
  `extensions/aura-mcp-client.test.ts`). Assert the Authorization header
  the caller sent, not live network calls.
- Inject a fake caller into `createAuraMcpInterface` over talking to a
  real Aura server for the typed MCP wrapper's tests: assert the envelopes
  it sends and the degraded-path errors it returns, never the network.
  The extension factories carry the seams one level up: `loadCredentials`
  (both MCP consumers) and `createInterface` plus `createCache` (the
  reference engine) take fakes; production wiring passes nothing.
- **Mock-fidelity for external-library integration (the `_embedRaw`
  lesson).** The local-embeddings provider mocks `@huggingface/transformers'`
  `pipeline`. A mock whose output shape doesn't match the real library's
  (a single `Tensor` with `dims=[N, hiddenDim]` and flat `data`, not an
  array of per-text tensors) passes unit tests while crashing real
  integration. Record the real output shape in the test (the
  `local-provider.test.ts` asserts a single `{data, dims:[N,384]}` tensor
  against a 2- and 3-text batch, with an off-by-one guard); the real-model
  end-to-end gate that once embedded every REST operation retired with the
  CLI, so the shape assertions in the embed suites are the remaining
  guard.

## Pi extension logic tests (`extensions/*.test.ts`)

Extension modules are unit-tested as pure exported functions run with
`node --experimental-strip-types` + `node:assert/strict`: each
`extensions/<name>.ts` gets a sibling `<name>.test.ts` of top-level assert
blocks that import the module directly, keeping the dynamic-import seams
(the typed MCP interface, settings, `node:sqlite`) out of the test path.
Run a suite with:

```bash
node --experimental-strip-types extensions/aura-references.test.ts
node --experimental-strip-types extensions/aura-reference-cache.test.ts
```

### Guard tests (`aura-mcp-contract`, `aura-mcp-server`)

Two guard families landed with the MCP interface ticket:

- **Provenance guards** (`extensions/aura-mcp-contract.test.ts`): the
  shipped tool contracts (names, parameter names, types, requiredness, enum
  values, descriptions) are cross-checked against the effort's verbatim
  introspection dump, so a hand-edit to the contract data that drifts from
  the recorded live server fails the suite.
- **Installed-source guards** (`extensions/aura-mcp-server.test.ts`): pin
  behavior this package depends on in pi itself, read from pi's installed
  source in `node_modules`: the user's own `mcp.json` entry taking precedence
  over an extension's registration, and the `session_start` flow that
  connects extension-registered servers. A pi upgrade that changes either
  fails the suite instead of breaking silently. Prefer asserting observable
  behavior over pinning source text when the behavior is reachable; use
  this source-pinning form only when it is not.

### Construction-path tests (the loopback fake instance)

When a suite must exercise a path that injected fakes would replace
(the production construction of the typed interface, for instance), the
pattern landed with the mention-machinery migration: a local fake
streamable-HTTP aura-mcp-dev server over loopback, reached by the real
pi-mcp client and transport, with the real credential loader running over
fixture seams (a tmp settings file plus a recording fake keyring). The
fake serves the shipped tool contracts so the self-check stays drift-free,
and the assertions cover what only the production path can show: the loader
was consulted, the loaded PAT rode the Authorization header, the endpoint
came from the loaded settings, and the acceptance criteria hold with no
injected caller anywhere.

`aura-reference-cache.test.ts` (the persistent sqlite store) exercises the
real `node:sqlite` store against temp-file databases (WAL pragma, upserts,
reopen persistence, base-URL keying, the silent in-memory fallback, the TTL
loader with injectable settings paths, and the warmup-gate decision with an
injected clock). For true cross-session concurrency it spawns real child
processes: a small driver written to a temp dir imports the store module by
absolute path and writes through its API while several children race the
same WAL file; the parent asserts exit codes, landed rows, and
`PRAGMA integrity_check`. That driver pattern (spawn + absolute-path import
+ exit-code assertions) is the seam for any future cross-process test.
