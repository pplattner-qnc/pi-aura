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
| Search skills | `mcpUnifiedSearch` with `source_types: ["SKILL"]` |
| List skills | `listSkills` (paginated) |
| Get skill detail | `mcpGetSkill` or `getSkill` |
| List skill assets | `listSkillAssets` |
| List skill plugins | `listSkillPlugins` |

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

## Assets

```
uploadSkillAsset({ uuid: "<skill-uuid>", ... })
```

## Import pipeline

1. `validateSkillImport` — upload a plugin ZIP, get validation results
2. `confirmSkillImport` — confirm import of selected skills
3. `getActiveSkillImportRun` / `getSkillImportRun` — poll import status
