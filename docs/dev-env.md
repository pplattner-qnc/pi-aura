# Dev environment

## How to start

```bash
# Clone + install build deps (the root workspaces install populates packages/shared)
git clone <repo>
cd pi-aura
npm install        # or: task install
```

There is no build step: the skill and the extensions ship and run as source.

## Aura instance + PAT

The package talks to an Aura instance over MCP. Point it at your instance by
setting `aura.baseUrl` in `~/.pi/agent/settings.json` (for example your
hosted Aura server's API base URL, `https://aura.example.com/api`); the
package derives the MCP endpoint from it (`/mcp` on the same instance, a
trailing `/api` stripped). Store the PAT in the OS keyring with
`/aura secrets discover` (imports one from an existing
`~/.config/mcp/mcp.json` entry) or `/aura secrets edit`. With no PAT
stored, the package's server registration skips silently.

## Reproduction

```bash
# Run the shared package's suite (the main verification; guards included):
cd packages/shared && npm test

# Run one extension suite:
node --experimental-strip-types extensions/aura-references.test.ts
```

## Do-not-attempt-AI-reproduction

- Don't attempt to spin up a real Aura instance or a real OS keyring from
  this environment. The keyring suites run `FileKeyring` against temp paths
  (no platform dependency); for other automated runs, inject a fake
  `Keyring` (`FakeKeyring`) or fakes at the extension factories' seams
  (`loadCredentials`, `createInterface`, `createCache`).
