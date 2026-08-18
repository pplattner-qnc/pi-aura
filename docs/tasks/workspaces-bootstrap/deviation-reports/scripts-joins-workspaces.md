## Deviation report — scripts-joins-workspaces

### API surface changes
- **Planned:** `scripts/package.json` adds `"@pi-aura/shared": "workspace:*"`
  to `dependencies`; `@napi-rs/keyring` is **kept** in both `dependencies` and
  `esbuild.config.mjs` `external` (per the arch spec + the slice doc's own
  Constraints/edge-case override). `esbuild.config.mjs` is otherwise
  untouched.
- **Actual:** Matches exactly. `scripts/package.json` `dependencies` is now
  `{"@modelcontextprotocol/sdk":"^1.30.0","@napi-rs/keyring":"^1.3.0","@pi-aura/shared":"workspace:*"}`.
  `esbuild.config.mjs` `external` is unchanged
  (`["@napi-rs/keyring","@napi-rs/keyring-linux-x64-gnu"]`). Only one file
  changed (`scripts/package.json`, +1/-1 line). No other files touched.
- **Impact:** None on dependent slices. Slice 3 (root manifest) can proceed —
  `scripts/` is a workspace member with `@pi-aura/shared` resolvable once the
  root declares workspaces. The `clients-cleanup` task owns the eventual
  removal of `@napi-rs/keyring` (dep + external entry together with the
  `clients.ts` import).

### Abstraction usage
- Used/was specified: yes. The existing `scripts/package.json` was modified
  in place (not rewritten). The existing `esbuild.config.mjs` `baseConfig`
  and `external` list were left untouched per the arch spec's "Do NOT
  reimplement: no new esbuild plugin, no alias config, no manual symlink."
  npm workspaces + bundler resolution handle the new dep. No manual symlink
  or alias was introduced.

### Out-of-scope changes
- None. The change is a single dependency line addition. No source files
  (`clients.ts`, `keyring.ts`, `aura.ts`, etc.), no esbuild config, no
  Makefile, no tsconfig were modified.

### Divergence from the slice doc's acceptance criteria
- **Important nuance — `@napi-rs/keyring` KEPT (not dropped), as required.**
  The slice doc's `## Acceptance criteria` section literally states two
  criteria that were **not** met:
  1. "`scripts/package.json` `dependencies` no longer has `@napi-rs/keyring`."
  2. "`esbuild.config.mjs` removes `@napi-rs/keyring` from `external`."
  
  However, the **same slice doc** overrides these in two other places:
  - **`## Test plan → Edge cases`:** "keep `@napi-rs/keyring` in `external`
    for now if `clients.ts` still imports it — re-add it to external only if
    the import survives this slice."
  - **`## Constraints / dependencies`:** "Do NOT drop `@napi-rs/keyring` from
    `scripts` deps in this slice — only add `@pi-aura/shared`."
  
  The **arch spec** is explicit and unambiguous: "Keep `@napi-rs/keyring` in
  `dependencies` … Keep `@napi-rs/keyring` in `external` … Leave `external`
  exactly as-is this slice."
  
  The implementation correctly followed the override (kept both). This is an
  **intended, spec'd deviation from the acceptance-criteria wording** — the
  criteria's "drop `@napi-rs/keyring`" line is contradicted by the same doc's
  edge-case/constraints sections and the arch spec. The implementer correctly
  resolved the contradiction in favor of the more specific guidance and the
  arch spec. No uncertainty decision was needed.
- **Post-install symlink criterion (not verified this slice):** The criterion
  "After `npm install` at root: `scripts/node_modules/@pi-aura/shared` is a
  symlink to `../../packages/shared`" was not verified here — the root
  `package.json` does not yet declare `workspaces` (that is slice 3's work),
  so a root `npm install` does not yet create the symlink. The build/typecheck
  gate still passes because nothing imports `@pi-aura/shared` yet. Slice 3
  owns the symlink-creation verification. This is expected, not a deviation.

### Task doc update needed?
- Yes — append to `## Implementation notes`: slice
  `scripts-joins-workspaces` added `"@pi-aura/shared": "workspace:*"` to
  `scripts/package.json` dependencies and kept `@napi-rs/keyring` in both
  `dependencies` and `esbuild.config.mjs` `external` (per arch spec + slice
  doc constraints, overriding the acceptance-criteria "drop" wording). The
  `clients-cleanup` task owns the eventual removal. The root `npm install`
  symlink is created by slice 3, not this slice.

### User attention needed?
- No. The implementation matches the arch spec exactly. The only "deviation"
  is from the slice doc's own contradictory acceptance-criteria wording — the
  implementer followed the more-specific override within the same doc and the
  arch spec. This is a **planning artifact inconsistency** (the slice doc's
  `## Acceptance criteria` contradicts its own `## Test plan` and `##
  Constraints`), not an implementation error. No scope change or API surface
  difference requires a user decision.
