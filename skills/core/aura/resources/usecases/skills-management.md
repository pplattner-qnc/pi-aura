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

## Assets, plugins, and import pipeline (REST-ONLY)

The following skill-administration capabilities are not available via MCP —
use REST or the Aura UI:

- **Skill assets** — `listSkillAssets` (REST-ONLY): `GET /skills/{uuid}/assets`
- **Skill assets** — `uploadSkillAsset` (REST-ONLY): `POST /skills/{uuid}/assets`
- **Skill plugins** — `listSkillPlugins` (REST-ONLY): `GET /skills/plugins`
- **Import pipeline** — `validateSkillImport` (REST-ONLY): `POST /skills/import/validate`
- **Import pipeline** — `confirmSkillImport` (REST-ONLY): `POST /skills/import/confirm`
- **Import pipeline** — `getSkillImportRun` (REST-ONLY): `GET /skills/import/runs/{uuid}`
- **Import pipeline** — `getActiveSkillImportRun` (REST-ONLY): `GET /skills/import/runs/active`

See `openapi-new.yaml` for the full REST endpoint details.
