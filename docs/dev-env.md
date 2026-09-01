# Dev environment

## How to start

```bash
# Clone + install build deps
git clone <repo>
cd pi-aura/scripts
npm install

# Regenerate the Aura REST client from the spec (after touching openapi/openapi.yaml)
npm run codegen

# Build the skill bundles into skills/*/dist/
task build
```

## Aura instance + PAT

The scripts talk to an Aura instance. For local development point the client
at a local Aura server (`http://localhost:3000/api`, the spec's default server)
or your hosted instance. The PAT/bearer token is currently read from
`~/.config/mcp/mcp.json` (`mcpServers.aura-mcp-dev`); the in-flight
`aura-access-rewrite` map is changing this.

## Reproduction

```bash
# Run the aura skill CLI against a workdir (artifact/wiki workflows):
node skills/core/aura/dist/aura.mjs artifact get <uuid>

# Run the morning digest fetch:
node skills/core/aura-digest/dist/aura-digest.mjs fetch
```

## Do-not-attempt-AI-reproduction

- Don't attempt to spin up a real Aura instance or a real GNOME Keyring from
  this environment. The keyring smoke test uses the live OS keyring on the
  dev machine; for automated runs, inject a fake `KeyringBackend`.
