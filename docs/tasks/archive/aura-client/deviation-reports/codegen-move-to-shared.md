## Deviation report — codegen-move-to-shared

### API surface changes
- **Planned:** Move the `@hey-api` codegen setup from `scripts/` into
  `packages/shared/`; repoint `openapi-ts.config.ts` input/output; add
  `@hey-api/client-fetch` (dep) + `@hey-api/openapi-ts` (devDep) + a
  `codegen` script to `packages/shared/package.json`; gitignore
  `packages/shared/src/generated/`; repoint the `Makefile` `codegen`/`gen`
  targets to `packages/shared`. Leave `scripts/src/generated/` +
  `scripts/openapi*` in place.
- **Actual:** All planned edits landed exactly as specified.
  `packages/shared/openapi/openapi.yaml` (moved verbatim),
  `packages/shared/openapi-ts.config.ts` (`input: "openapi/openapi.yaml"`,
  `output: "src/generated"`), `packages/shared/package.json` gains the two
  `@hey-api/*` deps + `codegen` script, `packages/shared/.gitignore` gains
  `src/generated/`, `Makefile` `codegen` target repointed to
  `cd $(SHARED_DIR) && npm run codegen` (with `SHARED_DIR := packages/shared`
  and `GEN_DIR := $(SHARED_DIR)/src/generated`); `gen` (codegen + typecheck +
  build) and `install` (root `npm install`) unchanged.
- **Impact:** None on dependent slices beyond what the spec predicted —
  `packages/shared/src/generated/` exists and the shared package's
  `npm run typecheck` passes on the generated tree (slice 2's precondition).

### Abstraction usage
- Used/was specified: yes — the exact `@hey-api/typescript` /
  `@hey-api/sdk` / `@hey-api/client-fetch` plugin triple and the same
  dep versions (`@hey-api/client-fetch@^0.13.1`,
  `@hey-api/openapi-ts@^0.64.2`) as `scripts/package.json` pins.

### Out-of-scope changes
- None. `scripts/package.json` was deliberately left untouched (its
  `@hey-api/*` deps stay until `clients-cleanup`), and `scripts/openapi*` +
  `scripts/src/generated/` (gitignored, untracked) were left in place.

### Task doc update needed?
Yes — appended to `## Implementation notes`: `make` is not on `PATH` in this
NixOS environment, so the GREEN was verified via `cd packages/shared &&
npm run codegen` + `npm run typecheck` (and `cd scripts && npm run typecheck`
for the old tree) rather than `make codegen` / `make gen`. The `Makefile`
targets were still repointed so they work once `make` is available.

### User attention needed?
No — scope and API surfaces match the spec. One environment note: `make`
is unavailable on this machine; the `Makefile` is correct but unverified
end-to-end here. CI / a machine with `make` should run `make gen` once to
confirm the target wiring.
