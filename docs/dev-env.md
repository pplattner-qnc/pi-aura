# Dev environment

## How to start

```bash
# Clone + install build deps (the root workspace populates packages/shared)
git clone <repo>
cd pi-aura
npm install

# Regenerate the Aura REST client from the spec (after touching openapi/openapi.yaml)
cd packages/shared && npm run codegen
```

## Aura instance + PAT

The extensions and the shared package talk to an Aura instance. For local
development point the client at a local Aura server
(`http://localhost:3000/api`, the spec's default server) or your hosted
instance. The PAT/bearer token is currently read from
`~/.config/mcp/mcp.json` (`mcpServers.aura-mcp-dev`); the in-flight
`aura-access-rewrite` map is changing this.

## Reproduction

```bash
# Run the shared package's suite (the main verification; guards included):
cd packages/shared && npm test

# Run one extension suite:
node --experimental-strip-types extensions/aura-references.test.ts
```

## Do-not-attempt-AI-reproduction

- Don't attempt to spin up a real Aura instance or a real GNOME Keyring from
  this environment. The keyring smoke test uses the live OS keyring on the
  dev machine; for automated runs, inject a fake `KeyringBackend`.
