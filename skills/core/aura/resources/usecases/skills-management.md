# Skills Management

> **⚠️ Discouraged for storing agent skills.** Aura's built-in skill system
> is a separate ecosystem from pi agent skills. Skills stored in Aura are
> not discoverable by pi agents and cannot leverage pi's tooling (subagents,
> extensions, codegraph, etc.). Prefer keeping agent skills in pi packages
> (like this one) where they are versioned, testable, and natively
> integrated. Use Aura skills only if you specifically need Aura's own
> skill-sharing workflow.

Aura has its own skill system — reusable skill documents with assets, plugins,
and an import/export pipeline. These are distinct from local agent skills.

## Finding skills

| Goal | Tool |
|---|---|
| Search skills | `unifiedSearch` with `source_types: ["SKILL"]` |
| List skills | `listSkills` (paginated) |
| Get skill detail | `getSkill` |

## Creating and editing skills

```
createSkill({ title: "My Skill", ... })
saveSkillBody({ uuid: "<skill-uuid>", body: "..." })
updateSkill({ uuid: "<skill-uuid>", title: "...", frontmatter: {...} })
```

## Publishing

```
setSkillVisibility({ uuid: "<skill-uuid>", ... })
```

Publish or retract a skill (owner only).

## Assets, plugins, and import pipeline

The following skill-administration capabilities are not available via MCP —
use the Aura UI:

- **Skill assets** — list and upload a skill's asset files
- **Skill plugins** — manage a skill's plugins
- **Import pipeline** — validate, confirm, and track skill imports
