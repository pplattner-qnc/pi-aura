## Deviation report — aura-command-skeleton

### API surface changes
- **Planned:** `extensions/aura-secrets.ts` exports default
  `function(pi: ExtensionAPI)` calling
  `pi.registerCommand("aura", { description, getArgumentCompletions, handler })`.
  `handler` splits `args`, dispatches on `secrets` → `discover`/`edit` (stubs),
  unknown/empty → `ctx.ui.notify(usage, "warning")`.
  `getArgumentCompletions(prefix)` completes `secrets`, then
  `discover`/`edit` when prefix is `secrets `. Appends
  `./extensions/aura-secrets.ts` to `pi.extensions`.
- **Actual:** Matches exactly. The default export calls
  `pi.registerCommand("aura", {...})` with `description`, `getArgumentCompletions`,
  and `handler`. The handler uses a `switch` on the parsed command; stubs notify
  `"not implemented"` (info); unknown/empty notifies `USAGE` (warning).
  `package.json` `pi.extensions` now lists both extensions.
- **Additive exports (for testability):** `parseAuraArgs(args): ParsedAuraArgs`,
  `getArgumentCompletions` (also exported standalone), and types
  `AuraSubcommand` / `ParsedAuraArgs`. These are additive — the default-export
  extension function is unchanged. They make the args-parser seam and
  completions unit-testable without a pi session, which the slice doc's test
  plan explicitly calls for ("the args parser is the seam — test it with
  `secrets discover`, `secrets edit`, `secrets`, `''`, `foo`").
- **Impact:** None on dependent slices. The exported `parseAuraArgs` +
  `ParsedAuraArgs` give slices 2/3 a stable parse seam; the dispatch `switch`
  is easy to extend (slice 2 replaces the `secrets-discover` stub, slice 3
  the `secrets-edit` stub).

### Abstraction usage
- Used/was specified: yes. `import type { ExtensionAPI } from
  "@earendil-works/pi-coding-agent"` — same import as the existing
  `aura-skill-instruction.ts` extension (confirmed: shape matches —
  `export default function(pi: ExtensionAPI) { ... }`). `pi.registerCommand`
  called with `{ description, getArgumentCompletions, handler }` exactly as
  the pi docs specify. `ctx.ui.notify(msg, "info"|"warning")` matches the
  confirmed API. No keyring import in this slice (correct — the spec said
  the skeleton may not need it; stubs don't call the keyring).
- The existing `aura-skill-instruction.ts` was **not** touched (confirmed via
  empty diff).

### Out-of-scope changes
- **Committed the smoke-test file** (`extensions/aura-secrets.test.ts`) and
  the **throwaway tsconfig** (`.work/tsconfig-aura-secrets.json`) as
  verification artifacts. The tdd-worker noted the slice doc describes the
  tsconfig as "throwaway" but didn't forbid committing it; keeping it makes
  the typecheck gate reproducible. This is a minor addition — the test file
  is a genuine test (not throwaway), and the tsconfig is a small,
  reusable verification aid. ⚠️ The arch spec's risk notes said the
  `aura-client` task may add a shared tsconfig; committing a `.work/`
  tsconfig now is reasonable but should be re-evaluated during that task
  (don't let two extension tsconfigs proliferate).
- **No discover/edit logic implemented** — correctly stubbed (both notify
  `"not implemented"`). Scope not widened.

### Divergence from the slice doc's acceptance criteria
- **`getArgumentCompletions("secrets")` returns the subcommand list**
  (`discover`/`edit`) in addition to `"secrets "`. The slice doc says
  completions complete `secrets` "and `discover`/`edit` when the prefix is
  `secrets `" (with trailing space). The implementation also offers
  subcommands when the prefix is exactly `"secrets"` (no trailing space) —
  i.e. once the first token is fully typed. This is the natural completion
  behavior (the test asserts it explicitly: `getArgumentCompletions("secrets")`
  → `[{discover}, {edit}]`). The spec wording focuses on the `"secrets "`
  prefix; this interpretation is consistent with the `"secrets d"`/`"secrets e"`
  examples and is arguably better UX (offers subcommands as soon as
  `secrets` is complete, before the user types the space). Not a defect.
- **All other criteria met:** default-export `function(pi)` ✅,
  `pi.registerCommand("aura", {...})` with description +
  getArgumentCompletions + handler ✅, dispatch on `secrets` →
  `discover`/`edit` ✅, unknown/empty → `notify(USAGE, "warning")` ✅,
  `pi.extensions` includes both extensions ✅. Extra-whitespace handling
  (`secrets  discover`) ✅ (via `trim().split(/\s+/).filter(Boolean)`).

### Task doc update needed?
- Yes — append to `## Implementation notes`: slice `aura-command-skeleton`
  created `extensions/aura-secrets.ts` with the `/aura` command skeleton +
  `parseAuraArgs`/`getArgumentCompletions` exported for testability. Stubs
  for `secrets discover`/`edit` (notify "not implemented"). A smoke-test
  file (`extensions/aura-secrets.test.ts`) and a throwaway tsconfig
  (`.work/tsconfig-aura-secrets.json`) were committed as verification
  artifacts; re-evaluate the tsconfig when the `aura-client` task considers
  a shared extension tsconfig.

### User attention needed?
- No. The deviations are: (1) additive testability exports (the slice doc's
  own test plan called for testing the args parser seam), (2) committed
  test + tsconfig artifacts (reasonable, re-evaluate later), and (3)
  `getArgumentCompletions("secrets")` offering subcommands without a
  trailing space (better UX, consistent with the spec's examples). No scope
  change, no API-surface difference for the extension contract, no blockers.
