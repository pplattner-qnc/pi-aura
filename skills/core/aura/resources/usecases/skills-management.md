# Skills Management

> **⚠️ Discouraged for storing agent skills.** Aura's built-in skill system
> is a separate ecosystem from pi agent skills. Skills stored in Aura are
> not discoverable by pi agents and cannot leverage pi's tooling (subagents,
> extensions, codegraph, etc.). Prefer keeping agent skills in pi packages
> (like this one) where they are versioned, testable, and natively
> integrated. Use Aura skills only if you specifically need Aura's own
> skill-sharing workflow.

Aura has its own skill system: reusable skill documents with assets, plugins,
and an import/export pipeline. These are distinct from local agent skills.

## Finding skills

| Goal | Tool |
|---|---|
| Search skills | `unifiedSearch` with `source_types: ["SKILL"]` |
| List skills | `listSkills` (paginated; own PERSONAL + all PUBLIC; `q`, `visibility`, and `plugin_id` filters) |
| Get skill detail | `getSkill` (compact default; `response_format: "detail"` for the working view) |

## Creating and editing skills

```
createSkill({ title: "My Skill", slug: "my-skill" })
saveSkillBody({ id: "<skill-uuid>", body: "..." })
updateSkill({ id: "<skill-uuid>", title: "...", frontmatter: {...} })
```

`createSkill` requires `slug` alongside `title` (URL-safe, lowercase
alphanumeric with hyphens) and places the skill in the canonical Skills
space with visibility defaulting to PERSONAL; `frontmatter` and
`parent_id` (nest under an existing FOLDER node) are optional.

## Publishing

```
setSkillVisibility({ id: "<skill-uuid>", visibility: "PUBLIC" })
```

Publish or retract a skill (owner only); `visibility` is required and is
`PERSONAL` | `PUBLIC`.

## Assets, plugins, and import pipeline

The following skill-administration capabilities are not available via MCP;
use the Aura UI:

- **Skill assets**: list and upload a skill's asset files
- **Skill plugins**: manage a skill's plugins
- **Import pipeline**: validate, confirm, and track skill imports
