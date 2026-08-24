## Deviation report — skill-non-model-invokable-and-skill-injection

### API surface changes
- **Planned:** Add `disable-model-invocation: true` to the frontmatter of `skills/core/aura-digest/SKILL.md`. One frontmatter line. No description or body changes (the slice doc and arch spec both scope this slice to the frontmatter only; L4 owns the body rewrite).
- **Actual:** Exactly one line added to the frontmatter: `disable-model-invocation: true` (inserted after the `description:` line, before the closing `---`). The `description` field is byte-for-byte unchanged. The body (17 474 chars, everything after the closing `---`) is byte-for-byte identical to the pre-slice version. No other files were touched (`git diff --name-only` returns only `skills/core/aura-digest/SKILL.md`).
- **Impact:** None on dependent slices. L4 (`rewrite-skill-md-to-tool-flow`) rewrites the body of this same file; the frontmatter key is orthogonal to that rewrite and can coexist.

### Abstraction usage
- Used/was specified: **yes.** `disable-model-invocation: true` is the exact frontmatter key documented in the pi skills doc (skills.md L149) and named in the arch spec's "Existing abstractions to use" section. No new abstraction was invented.

### Out-of-scope changes
- **None.** The diff is a single `+1` line:
  ```
  3a4
  > disable-model-invocation: true
  ```
  Verified: `git diff task/digest-slash-launch-rewrite..slice/skill-non-model-invokable-and-skill-injection --stat` → `1 file changed, 1 insertion(+)`. No description edit, no body edit, no other file touched.

### Task doc update needed?
- **No.** The slice is a one-liner with no deviation. The hitl verification (fresh-session system-prompt inspection + `/digest` injection test) is owed to the parent orchestrator, as the slice doc explicitly states this is a pi-runtime behavior with no unit test.

### User attention needed?
- **No** for the code change itself — it is exactly as specified. The owed **hitl verification** (confirm the skill description is absent from a fresh session's system prompt, and `/digest` still injects + runs the skill despite `disable-model-invocation: true`) is the slice's remaining gate. The slice doc flags that if the injected skill doesn't run because it's hidden, the team should return to Wayfinder (the hide + inject combination is the map's Fog risk).

---

### Review findings

**Diff verification:**
- The committed diff on `slice/skill-non-model-invokable-and-skill-injection` (commit `0e7d49f`) contains exactly one change: adding `disable-model-invocation: true` to `skills/core/aura-digest/SKILL.md` frontmatter.
- Frontmatter parse confirms the key is present with value `true`.
- Body comparison (programmatic): `BODIES IDENTICAL` — the 17 474-char body is byte-for-byte unchanged.
- Description comparison: `descriptions match: True` — the `description:` line is unchanged.
- No out-of-scope files touched.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "git diff task/digest-slash-launch-rewrite..slice/skill-non-model-invokable-and-skill-injection shows exactly 1 file (skills/core/aura-digest/SKILL.md) with 1 insertion: 'disable-model-invocation: true' added to frontmatter. Description and body are byte-for-byte identical (verified programmatically: bodies identical, descriptions match)."
    }
  ],
  "changedFiles": [
    "skills/core/aura-digest/SKILL.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git diff task/digest-slash-launch-rewrite..slice/skill-non-model-invokable-and-skill-injection --stat",
      "result": "passed",
      "summary": "1 file changed, 1 insertion(+) — skills/core/aura-digest/SKILL.md only"
    },
    {
      "command": "node -e (frontmatter parse)",
      "result": "passed",
      "summary": "Frontmatter contains disable-model-invocation: true; body starts with '# Aura — Digest'; body length 17474 chars"
    },
    {
      "command": "python3 body/description comparison",
      "result": "passed",
      "summary": "BODIES IDENTICAL; descriptions match: True — no body or description changes"
    },
    {
      "command": "git diff --name-only",
      "result": "passed",
      "summary": "Only skills/core/aura-digest/SKILL.md changed; no out-of-scope files"
    }
  ],
  "validationOutput": [
    "Diff is a single line: +disable-model-invocation: true in SKILL.md frontmatter",
    "Description field unchanged (byte-for-byte match)",
    "Body unchanged (17,474 chars, byte-for-byte identical)",
    "No other files touched in the slice branch diff",
    "Frontmatter parses as valid YAML with the key present and value true"
  ],
  "residualRisks": [
    "Owed hitl verification not done by this report: confirm in a fresh pi session that the aura-digest skill description is absent from the system prompt and that /digest still injects + executes the skill despite disable-model-invocation: true. This is the slice's remaining gate, not a code deviation."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added 'disable-model-invocation: true' to the frontmatter of skills/core/aura-digest/SKILL.md (1 insertion, 0 deletions). No description or body changes. No other files touched.",
  "reviewFindings": [
    "no blockers — the ONLY change is the single frontmatter line as specified; description and body are untouched"
  ],
  "manualNotes": "The code change is exactly as specified. The owed hitl verification (fresh-session system-prompt inspection + /digest injection test) is the remaining gate — it is a pi-runtime behavior, not a code-deviation concern."
}
```
