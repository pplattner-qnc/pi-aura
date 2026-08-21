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

Graph expansion (`getMemoryGraph`/`getMemoryMap`) is not available via MCP
after the overhaul. Use `listMemoryEntities` for the faceted entity list,
`getMemoryEntitySource` to resolve an entity's source, and
`reportMemoryEntityQuestion` to flag questionable entities. For
anchor→depth expansion, use the REST endpoints `/memory/graph` and
`/memory/map` (see `openapi-new.yaml`).

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

Returns a faceted list of entities matching the query, optionally filtered
by type, status, and provenance. Use this to find entities of interest
before resolving their sources or expanding the graph via REST.

### `getMemoryEntitySource` — resolve entity source

```
getMemoryEntitySource({ stable_id: "<entity-stable-id>" })
```

Returns the source system and provenance for a given entity, so you can
trace where a graph node originated (e.g. which task or Jira issue it came
from).

## Reporting issues

```
reportMemoryEntityQuestion({ stable_id: "<entity-stable-id>", reason: "..." })
```

Flags an entity as questionable — e.g. an inferred edge that seems wrong, a
duplicate entity, or a stale fact. Use this whenever the graph surfaces
something that doesn't look right so the system can re-evaluate.
