# Memory / Knowledge Graph

Aura maintains a knowledge graph connecting entities (tasks, Jira issues,
and, as the system matures, products, services, people, concepts) with
typed, confidence-scored edges.

## When to use this

The memory graph shines for **higher-level work**: planning, refinement,
stakeholder alignment, architecture overview, understanding how things
relate. This is where Aura's own interface tends to fall short, and where
having an agent explore the graph conversationally is genuinely useful.

Use it when you need to understand how things relate at a high level:

- "What systems does this service depend on?"
- "What tasks relate to this topic?"
- "Give me an overview of the observability landscape."
- "What do we know about entity X?"

For **concrete implementation work** (writing code, fixing bugs), prefer
local code search, the wiki, or direct task/artifact lookups. The graph can
surface loosely related nodes that add noise rather than signal when you
need precision (e.g. suggesting a library that doesn't apply to your
specific codebase). This isn't a reason to avoid the graph; it's about
choosing the right tool for the job.

## Current data sources

The graph is populated from these source systems:

| Source | `edge_origin` | What it contributes |
|---|---|---|
| **Aura tasks** | `task` | Tasks as entities, relations between them |
| **Jira** | `jira` | Jira issues mirrored as entities, links to Aura tasks |
| **Knowledge / Wiki** | `knowledge` | Concepts extracted from wiki documents |
| **Questions** | `question` | Q&A entries as entities |

In practice, the graph is currently dominated by **tasks** and **Jira
issues**. The richer entity types (`product`, `service`, `api`, `person`,
`capability`, etc.) exist in the schema but are sparsely populated.

### Fact layers

Each edge carries a provenance layer:

| Layer | Meaning |
|---|---|
| `source` | Directly from a source system |
| `public` | Publicly known facts |
| `inferred` | AI-inferred relationships |
| `external` | External systems |
| `aura_native` | Aura-internal entities |
| `open_question` | Unresolved questions |

Edges also have a `status`: `CONFIRMED`, `CANDIDATE`, `SUPERSEDED`, or
`CONTESTED`. Default queries only return `CONFIRMED` edges; set
`include_candidates: true` to also see unverified connections.

## Exploring the graph

Graph expansion (`getMemoryGraph`/`getMemoryMap`) is not available via MCP
after the overhaul. Use `listMemoryEntities` for the faceted entity list,
`getMemoryEntitySource` to resolve an entity's source, and
`reportMemoryEntityQuestion` to flag questionable entities. For
anchor-to-depth expansion, use the Aura UI.

### `listMemoryEntities`: faceted entity list

```
listMemoryEntities({
  q: "authentication",
  entity_type: "service",
  status: "CONFIRMED",
  include_candidates: "false",
  include_superseded: "false",
  show_evidence_edges: "false",
  limit: 20
})
```

Returns a paginated, access-filtered list of entities matching the query.
Beyond type, status, and provenance, the facet vocabulary covers
`confidence_min` (`low` | `medium` | `high`), `edge_origin` (`knowledge` |
`task` | `jira` | `question`), `fact_layer` (`source` | `public` |
`inferred` | `external` | `aura_native` | `open_question`), `predicate`,
and `sensitivity` (`PUBLIC` | `RESTRICTED` | `CONFIDENTIAL`), plus `page`
and `sort_by`/`sort_dir` ordering. `include_candidates`,
`include_superseded`, and `show_evidence_edges` are required parameters
(pass `"false"` for the default trust set). Use this to find entities of
interest before resolving their sources or expanding the graph further.

### `getMemoryEntitySource`: resolve entity source

```
getMemoryEntitySource({ stable_id: "<entity-stable-id>" })
```

Returns an internal route or external URL for jumping to the operative
source behind a memory-graph node (task, Jira issue, or related doc), so
you can open the thing a graph node stands for. The `stable_id` is a
stable business key, not a UUID (e.g. `task:{uuid}` or `jira:anw-1234`).

## Ingesting from artifacts

```
acceptArtifactMemory({ id: "<artifact-uuid>" })
```

The aura-native memory ingest: an explicit validation signal that enqueues
embedding and knowledge-graph extraction for the artifact's latest version
body. Owner-only, and idempotent when the content hash is unchanged, so
re-accepting an unchanged artifact costs nothing.

## Reporting issues

```
reportMemoryEntityQuestion({ stable_id: "<entity-stable-id>" })
```

Flags an entity as questionable: it creates or reuses an open question
linked to the knowledge entity. It does not modify graph edges; corrections
flow through OpenQuestion only. Use this whenever the graph surfaces
something that doesn't look right so the system can re-evaluate. The tool
takes only the `stable_id`; there is no reason parameter.
