# Cursor/Cline → pi adaptation pattern registry

A registry of Cursor/Cline-runtime patterns already encountered in the
`engineering-foundation` wiki and how to adapt them to the pi agent. Append
here as you encounter new ones during a sync — each entry names the pattern,
shows the source shape, gives the pi-adapted shape, and notes the rationale
and whether it's a hard rewrite or a keep-with-note.

This is a **reference catalog**, not an exhaustive checklist: a sync run must
still scan each fetched file for Cursor-specific edges; the registry is the
accumulated memory of what those edges look like and how they were handled, so
the next run adapts consistently instead of re-deciding from scratch.

## How to use it

- During reconciliation, when you find a Cursor/Cline-runtime tool or primitive
  in a file, check this registry first — if the pattern is here, apply the
  recorded adaptation; if it isn't, adapt it per the skill's "What adaptation
  means" section and **append the new entry here** so the next run knows.
- A pattern belongs here if it's a *tool or runtime primitive* that exists in
  the Cursor/Cline environment but not in pi. It does **not** belong here if
  it's an anwalt.de environment assumption to keep (Jira/Bitbucket/`task`/
  worktree/`fork-db` — those MCPs are or will be installed) or a generic
  concept (the target repo's `AGENTS.md`, `.cursor/rules` paths).

## Entries

### `AskQuestion` (Cursor/Cline tool call)

- **Source shape:** `` `AskQuestion` `` / `AskQuestion(...)` — the Cursor
  multi-choice question tool.
- **pi-adapted:** `` `ask_user_question` `` (pi's tool). Note the constraints:
  2–4 options per question, a 16-char `header` limit, the reserved "Type
  something." row. If the source bundles several questions in one call, split
  into multiple `ask_user_question` calls (pi's 2–4-option limit).
- **Rationale:** pi's question tool is `ask_user_question`; the call shape and
  constraints differ. Hard rewrite.
- **Found in:** all 14 blueprint skills, `workflow/development-workflow.md`.

### `SwitchMode` / plan mode (Cursor mode toggle)

- **Source shape:** `SwitchMode` with `target_mode_id: "plan"`, "switch to plan
  mode", "implement directly in plan mode".
- **pi-adapted:** drop the tool call; the agent works in normal mode. Replace
  "implement directly in plan mode" → "implement directly"; "switch to plan
  mode via `SwitchMode`" → removed (the plan is presented as a chat block).
  If the skill relies on plan mode for a structural reason, record the
  decision per skill (the skill's decision-notes section / inventory).
- **Rationale:** pi has no plan/normal mode split and no `SwitchMode` tool.
  Hard rewrite (drop).
- **Found in:** `task-slice`, `task-implement` (checklists).

### `CreatePlan` (Cursor plan-creation tool)

- **Source shape:** `CreatePlan` / "call `CreatePlan` here".
- **pi-adapted:** drop the call; the plan output becomes a chat block
  ("Present the plan as a chat block — the agent works in normal mode; there
  is no plan-creation tool to call").
- **Rationale:** pi has no plan-creation tool. Hard rewrite (drop to chat block).
- **Found in:** `task-slice`.

### `subagent_type` / `run_in_background` / `generalPurpose` / `Task` (Cline subagent primitives)

- **Source shape:** `subagent_type: "best-of-n-runner"` with
  `run_in_background: true`; "all `Task` calls in a single message"; "hand its
  path to a `generalPurpose` subagent" — the Cline subagent-spawn primitives.
- **pi-adapted:** use pi's `subagent` tool. For one child: `subagent` with
  `agent` + `task`. For parallel fanout (the "all `Task` calls in a single
  message" shape): one top-level `subagent` call with `workflowScript` +
  `async:true`, launching children via `runs.run` / `runs.all([...])` inside the
  script. `worktree:true` gives managed isolation if the source wanted separate
  worktrees. Replace the `subagent_type`/`run_in_background`/`generalPurpose`
  vocabulary with pi's (`agent`, `task`, `runs.run`, `runs.all`, `worktree`).
- **Rationale:** these are Cline's subagent primitives; pi's subagent model is
  the `subagent` tool (single-child or `workflowScript` orchestration). A pi
  agent reading `subagent_type: "best-of-n-runner"` has nothing to call. Hard
  rewrite.
- **Found in:** `task-implement` (the "one subagent per slice, launched
  concurrently" paragraph).

### `emit_review` (Cline headless PR-review output tool)

- **Source shape:** "is `emit_review` available?" as a mode-detection signal;
  `emit_review(verdict, reportMarkdown)` as the headless agent's output call;
  the "pull-request mode (headless) vs local mode" branch keyed on it.
- **pi-adapted:** `emit_review` does not exist in pi, so the mode-detection
  ("is it available?") always resolves to "local mode" and the headless path is
  dead. Adapt the detection to a pi-runtime signal if one exists (e.g. an
  environment variable / extension the PR-review runner sets), or if the
  headless PR-review mode is not currently reachable from pi, replace the
  branch with a note that the skill runs in local mode and the headless output
  path is a future adaptation (record the decision in the inventory). Do **not**
  leave `emit_review` as a literal tool name a pi agent would try to call.
- **Rationale:** `emit_review` is a Cline/Cursor-runtime output tool, not an
  anwalt.de MCP assumption (it is not Jira/Bitbucket/`task`/worktree/`fork-db`).
  Leaving it as-is is the same error shape as leaving `AskQuestion`. Hard
  rewrite (adapt or defer with a note).
- **Found in:** `pr-review` (the mode-detection + output rows + verdict step),
  `workflow/development-workflow.md` (the mode-detection paragraph + output
  line).

### `AGENTS.md` key lookups (shorthand)

- **Source shape:** `` `AGENTS.md` → key `Doc language` `` or bare
  `` key `Doc language` `` (shorthand for the same).
- **pi-adapted:** prefix with "the target repo's": "the target repo's `AGENTS.md`
  → key `Doc language`". Keep the *concept* (the keys live in the target
  repo's `AGENTS.md`, which the anwalt.de repos have); only the *addressing*
  changes so the agent reads the repo's file rather than assuming a pi-side
  register.
- **Rationale:** pi has no built-in AGENTS.md register; the file is real in the
  target repos. Hard rewrite (prefix).
- **Found in:** all 14 skills, all 15 rules, `development-workflow.md`.
- **Note:** example tracker keys like `ANW-6595` (in `task-preflight-checks`)
  are **not** AGENTS.md lookups — they're example ticket keys and stay verbatim.
