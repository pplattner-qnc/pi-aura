---
type: ticket
subtype: feature
title: Aura MCP registration and typed interface
status: stable
workflow_state: ready
blocked_by: []
size: m
---

## What to build

The package installs its own connection to Aura and gains one typed door to it.

One extension part registers the model-facing `aura-mcp-dev` MCP server when the package loads: endpoint from the shared settings, PAT from the OS keyring, silently skipped when no PAT is stored, and always yielding to a server entry the user configured themselves. A model that runs with this package installed gets the Aura tools without any manual configuration step.

A typed wrapper module stands on `@earendil-works/pi-mcp` (the MCP client library pi itself uses; it is present in the dependency tree and resolvable inside the pi process where extensions run) with its streamable HTTP transport. The wrapper provides strictly typed methods for the surface the mention machinery and the feedback tool use: task search (full text plus archived visibility, paging, sorting), the task read by human key, artifact search and read, knowledge search, the tree fetch, the node reads by identifier and by path, the space listing, and feedback creation. Every type derives from the effort's introspection evidence (the verbatim 120-tool server surface).

The wrapper carries the contract self-check decided by the operator: on every initialization it fetches the server's live tool schemas and compares them against the definitions the package ships. Cosmetic drift (a new optional parameter, a changed description) produces a user-visible warning naming the tool and the difference. Core drift (a tool gone; a parameter the wrapper sends or reads renamed, retyped, or newly required) makes that tool's path unavailable: calls to it fail fast, the warning names what broke, and consumers degrade to their established cache-only behavior. The shipped definitions are refreshed whenever the package re-audits the server.

Tests run against an injectable caller seam: envelopes, error mapping (including application errors inside HTTP 200), the self-check verdicts, and the registration no-op without credentials.

## Acceptance criteria

- [ ] With a PAT in the keyring, a fresh pi session that did not configure any MCP server has the `aura-mcp-dev` tools available.
- [ ] With no PAT stored, the package loads cleanly, registers nothing, and stays silent.
- [ ] A user's own configuration entry for `aura-mcp-dev` takes precedence over the package's registration.
- [ ] The typed wrapper calls every listed tool through pi's MCP client library; the package contains no hand-rolled protocol code.
- [ ] The self-check turns a simulated cosmetic drift into a warning and a simulated core drift (tool missing, parameter renamed, retyped, or newly required) into a fail-fast unavailable path, each naming the tool and the difference.
- [ ] The wrapper's call sites can inject a fake caller; its envelopes, error mapping, and verdicts are covered by tests.
- [ ] No new runtime npm dependency is added to the package manifest.

## Blocked by

None (can start immediately).
