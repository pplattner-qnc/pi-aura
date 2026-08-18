# Testing

This repo has no automated test suite yet. Verification is manual + typecheck + build.

## Framework

_(None. `npm run typecheck` and `make build` are the gate; ad-hoc scripts are
bundled with esbuild and run with `node` for smoke tests.)_

## Run commands

```bash
# From scripts/
npm run typecheck      # tsc --noEmit
npm run build          # esbuild -> skills/*/dist/*.mjs
npm run codegen        # regenerate src/generated/ from openapi/openapi.yaml

# Smoke test the keyring (pure-JS, no native bindings):
#   bundle a one-off entry with esbuild and run with node — see keyring.ts
#   development notes. No committed test runner yet.
```

## Mock conventions

_(Not established yet. When tests are added, prefer injecting a fake
`KeyringBackend` / a generated-client stub over hitting real Aura or the real
OS keyring.)_
