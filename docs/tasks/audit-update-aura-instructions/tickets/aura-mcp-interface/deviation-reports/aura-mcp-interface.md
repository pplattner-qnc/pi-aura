---
type: deviation report
title: Deviation report for aura-mcp-interface
status: stable
---

# Deviation report: aura-mcp-interface

Reviewed `git diff 8ab1e9b..ticket/aura-mcp-interface` (six commits on top of the effort's architecture and ticket-docs commit; seven files, 2385 insertions) against the arch doc's ticket-1 interface contract, the operator's phase decisions, and the ticket's acceptance criteria. Independent gate re-run by this review: the three new extension suites, the full ten-suite extension loop, `packages/shared` npm test (169 pass, 0 fail), `task typecheck` (clean), `task build` (clean). All green, matching the implementation result's claims.

### API surface changes

- **Planned:** One extension registers the model-facing `aura-mcp-dev` server at load (settings endpoint, keyring PAT, silent no-op without a PAT, a user's own mcp.json entry keeps precedence). A typed wrapper module over `@earendil-works/pi-mcp` provides the strictly typed tool surface (task search with full-text, archived visibility, paging, sorting; task read by human key; artifact search and read; knowledge search; tree fetch; node reads by identifier and by path; space listing; feedback creation), carries the contract self-check (cosmetic drift warns naming the tool and the difference; core drift fails fast and marks the path unavailable), and takes an injectable caller seam. Exports to dependents: the wrapper constructor with the caller seam, the per-tool typed methods, a degraded-path error mapped onto cache-only behavior, and registration that survives absent credentials.
- **Actual:** Every item on that list exists and is tested. `createAuraMcpInterface(options)` is the constructor (options carry the caller seam plus `baseUrl`, `pat`, and `notify` test hooks), with exactly ten typed methods, one per capability in the spec's list, `AuraMcpToolUnavailableError` as the degraded-path error, and a silent registration skip for a missing PAT (and additionally for a missing base URL; see below). Three additions beyond the spec's letter, none breaking:
  1. The typed wrapper is two modules, not one. `extensions/aura-mcp-contract.ts` holds the shipped tool contracts, the drift comparison, the server name, and the endpoint derivation as pure data and pure functions (no imports, no I/O); `extensions/aura-mcp-client.ts` is the typed wrapper over the caller. Only `extensions/aura-mcp-server.ts` is registered in the manifest, so "one extension" still holds.
  2. Cosmetic-drift warnings surface through an injectable `notify` hook (the extension warning pattern); without one they are retrievable only through `interface.selfCheck()`. The wrapper never notifies on its own.
  3. The drift comparison covers type, requiredness, enum membership, default, and description. JSON-Schema bounds the dump records (`minLength`, `maxLength`, `minimum`, `maximum`) are deliberately not compared: a bound tweak neither renames nor retypes a parameter, and the choice is documented in the module comment.
- **Impact:** None of the exports to dependents changed. Tickets 2 (mention machinery) and 3 (feedback tool) receive exactly the surface they were promised, with two things they must know: the contract data they may want to read (tool names, endpoint derivation, server name, which the wrapper re-exports) lives in `aura-mcp-contract.ts`, and they must pass `notify` when constructing the interface if the user is ever to see cosmetic drift; otherwise only `selfCheck()` reveals it.

### Abstraction usage

- Used/was specified: yes. pi's MCP client library (`McpClient` plus `StreamableHttpTransport`) is reached through the dynamic-import seam, and a test verifies the import resolves in this installation (which is the installed package). No protocol code is hand-rolled; a guard asserts no static pi-mcp import and no JSON-RPC wire literals in the three modules. The shared settings and keyring modules are used through their dynamic-import seams with fixtures (a temp settings file, a fake keyring) in the tests. The extension warning pattern appears as the `notify` hook type. Remnants-style guards pin the absences: no new runtime dependency (a guard asserts the manifest grows no dependencies block; package.json gains only the extension entry), and pi's user-config precedence plus the session_start connect flow are pinned by reading the installed pi source, so a pi upgrade that changes either fails the suite.

### Out-of-scope changes

- `extensions/aura-mcp-contract.ts` (569 lines) is an added module beyond the spec's "a typed wrapper module" description. Testability-driven split: pure contract data and the drift comparison separated from the I/O-bearing wrapper, consumed by both the wrapper and the registration extension.
- Test-only guards beyond the literal ticket text: the provenance guard (shipped contracts cross-checked against the effort's introspection dump: descriptions, parameter names, types, requiredness, enum values), the pi-source guards (user-config precedence, session_start wiring, registeredServers, startConnection), and the no-protocol, no-new-dependency guard. The implementation result declares the registration-to-connection guard as its one test-only addition; the other guards are the same kind of addition and were not itemized there.
- Registration additionally no-ops when `aura.baseUrl` is missing. The spec names only the missing PAT; without a base URL there is no endpoint to derive, so this is a conservative superset that keeps the criterion-2 behavior (clean, silent load).
- The new source comments and tests introduce em-dashes (16 lines across the three source files, plus test-file lines), against the AGENTS.md rule banning em-dashes in repo prose including code comments. Pre-existing extension files share the flaw (aura-feedback.ts carries 27), and this effort's explicit em-dash cleanup is scoped to root docs, so this is a convention debt the ticket adds to rather than resolves. A quick sweep of the six new files would make the rule whole for this ticket.
- Bookkeeping: the implementation result says "four checkpoints"; the branch carries six commits after the base (`f46f539` contract drift comparison, `8300782` core-drift verdicts, self-check aggregation, endpoint derivation, then the four the result names). The content is all in the diff; only the count in the result doc is off.
- Nothing was removed and no consumers were wired. Tickets 2 and 3 are the consumers and are blocked by this ticket, so the degrade path's real consumers do not exist yet; the degraded-path error is exported and tested against fakes.

### Ticket doc update needed?

Yes. The ticket has no `## Implementation notes` section yet; create it and append:

- Module layout: contract data, self-check, endpoint derivation in `extensions/aura-mcp-contract.ts`; typed wrapper in `extensions/aura-mcp-client.ts`; registration extension `extensions/aura-mcp-server.ts` (the manifest's one new extension entry).
- Calling convention for tickets 2 and 3: `createAuraMcpInterface({ caller?, baseUrl?, pat?, notify? })`; pass `notify` to surface drift warnings to the user (otherwise read `selfCheck()`), map `AuraMcpToolUnavailableError` onto cache-only degradation, and treat `AuraMcpCallError` as covering both caller-level rejections (transport, protocol, timeout, with the cause preserved) and application errors inside HTTP 200 (`isError` results).
- Self-check semantics recorded for dependents: runs once per interface construction; a failed live fetch is a silent `skipped` verdict with every path callable and natural errors surfacing on call (so a server unreachable at init produces no drift signal at all); schema bounds are not compared, so a tightened bound (for example the `title` maxLength on `createFeedback`) surfaces only as an `AuraMcpCallError` at call time.
- Registration semantics: unconditional when credentials exist; precedence for a user's own mcp.json entry is pi's own rule, not a pre-check, pinned by the guard test so a pi upgrade that drops it fails the suite.

### User attention needed?

No. Scope and the exported surfaces match the arch spec's exports-to-dependents list exactly; the differences above are internal structure, semantics for cases the spec left open (what a failed self-check fetch means, how warnings reach the user), and test additions. One thing deliberately remains a human verification, already declared in the implementation result's handoff: the live-session smoke test for criterion 1, a fresh `pi` session with a stored PAT and no mcp.json entries, checking that the Aura tools appear, that a no-PAT session loads clean and silent, and that a user mcp.json entry overrides the package's registration.
