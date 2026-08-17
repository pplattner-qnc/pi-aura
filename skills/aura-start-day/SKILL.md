---
name: aura-start-day
description: Morning routine — get oriented in Aura. Run at the start of your workday for a quick digest of what needs attention.
---

# Aura — Start Your Day

Two-step pipeline: one fetcher agent gathers data via `mcpScript` (no LLM for
the API calls), then one digest agent summarizes it. The fetcher writes to a
temp file so the digest agent reads from disk — no raw data passes through
the orchestrator context.

---

## Step 1: Fetch + digest pipeline

Launch this workflow:

```js
subagent({
  mission: false,
  workflowScript: [
    "const fetchOutput = '/tmp/aura-morning-' + Date.now() + '.md';",
    "",
    "// Step 1: Fetch all data via mcpScript (no LLM for API calls)",
    "const fetcher = await runs.run('fetch', {",
    "  agent: 'aura-morning-fetcher',",
    "  output: fetchOutput,",
    "  task: 'Fetch all morning routine data from Aura and write it to your output file.'",
    "});",
    "",
    "// Step 2: Create digest from the fetched data",
    "const digest = await runs.run('digest', {",
    "  agent: 'aura-morning-digest',",
    "  task: 'Read the file at ' + fetchOutput + ' and create a concise morning digest.'",
    "});",
    "",
    "return { digest: digest.output, fetchOutput };",
  ].join("\n")
})
```

Wait for the workflow to complete.

---

## Step 2: Present and act

Present the digest output from the workflow. Then:

- Mark notifications read via MCP: `aura_2d_mcp_2d_dev_markAllNotificationsRead()`
- **Delete the temp fetch file** returned as `fetchOutput` from the workflow.
  It was only a transport for the digest step and is now garbage — removing it
  keeps `/tmp` clean. Use bash:

  ```bash
  rm "<fetchOutput path>"
  ```

---

## Scope and handoff

**This skill covers only the morning fetch + digest + notification cleanup.**
The moment you move on to any further Aura work — looking up tasks, posting or
editing comments, reading or editing artifacts, capacity changes, wiki work,
code search, signals, etc. — **load the `aura` skill** and follow its
conventions for the remainder of the session. Do not call `aura-mcp-dev` tools
ad-hoc from this skill; route that work through the `aura` skill instead.

Key conventions the `aura` skill enforces (so you don't silently miss them):
- Set `is_ai_generated: true` on AI-authored comments.
- Use the file-based `mcpx` workflow for artifact edits > ~500 chars.
- Prefer `mcp*` tool variants (`mcpGetArtifact`, `mcpUnifiedSearch`, …).
- Log activity with `recordTaskProgress` when you act on a task.

**[ASK]** only if there are actionable items:

- Anything overdue or waiting on you → "These need your attention. Want to tackle any now?"
- Reviews pending → "You have N reviews waiting. Start any?"
- Over-committed → "You're at X% commitment — adjust or flag to manager?"
- Otherwise → "Ready to go?"
