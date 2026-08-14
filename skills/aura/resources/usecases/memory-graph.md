# Memory / Knowledge Graph

Aura maintains a knowledge graph connecting entities (tasks, Jira issues,
and — as the system matures — products, services, people, concepts) with
typed, confidence-scored edges.

## When to use this

The memory graph shines for **higher-level work** — planning, refinement,
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
need precision — e.g. suggesting a library that doesn't apply to your
specific codebase. This isn't a reason to avoid the graph; it's about
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
`CONTESTED`. Default queries only return `CONFIRMED` edges — set
`include_candidates: true` to also see unverified connections.

## Exploring the graph

### `getMemoryGraph` — expand from an anchor

```
getMemoryGraph({
  anchor: "<entity-stable-id>",
  depth: 2,
  include_candidates: "false",
  include_superseded: "false",
  show_evidence_edges: "true"
})
```

**Filters:** `confidence_min`, `entity_type`, `fact_layer`, `status`,
`edge_origin`, `predicate`, `sensitivity`

Edge line style: solid = structural/source, dashed = inferred/candidate.

### `getMemoryMap` — cluster overview

```
getMemoryMap({
  level: "overview",
  include_candidates: "false",
  include_superseded: "false",
  show_evidence_edges: "false"
})
```

Returns aggregated clusters of connected entities.

### `listMemoryEntities` — faceted entity list

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

### `mcpExpandGraph` — agent-facing graph expansion

```
mcpExpandGraph({ stable_id: "<entity-stable-id>", depth: 2 })
```

### `getMemoryEntitySource` — resolve entity source

```
getMemoryEntitySource({ stable_id: "<entity-stable-id>" })
```

## Reporting issues

```
reportMemoryEntityQuestion({ stable_id: "<entity-stable-id>", reason: "..." })
```
