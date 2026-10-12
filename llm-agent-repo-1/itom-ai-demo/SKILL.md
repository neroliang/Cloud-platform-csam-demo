---
name: itom-topology-flow
description: Convert raw ITOM/CMDB infrastructure data (Neo4j/Cypher exports, Graphviz DOT, ServiceNow CI dumps, cloud inventory JSON, or an existing Svelte Flow dataset) into a validated, state-reactive Svelte Flow (@xyflow/svelte) node/edge module plus the custom node components needed to render multi-cloud topology, service dependency, and impact/blast-radius views. Use when the user asks to render or visualise ITOM/CMDB/CSPM data, cloud asset graphs, an application dependency map, or to convert infrastructure inventory into a Svelte Flow diagram.
license: MIT
metadata:
  version: "1.0"
---

# ITOM Topology → Svelte Flow

Turn infrastructure inventory and operational telemetry into a ready-to-render
Svelte Flow dataset. The primary output is a single ES module exporting
`initialNodes` and `initialEdges`; [svelte.js](svelte.js) is the canonical output
example and [web_data.json](web_data.json) is the matching input.

Produce **data plus presentation metadata**, never a prose-only answer. Do not
invent configuration items (CIs) or relationships that the input does not
support. When a value is unknown, omit the field rather than guessing.

## When to use this skill

Trigger on requests such as:

- "visualise / render this CMDB export, Neo4j dump, or ServiceNow CI list"
- "draw the dependency, service-map, or impact / blast-radius graph for these services"
- "convert this infrastructure inventory into a Svelte Flow diagram"
- "show multi-cloud topology (Azure / AWS / OCI) from this data"

Do not use this skill for generic, non-ITOM architecture diagrams; use a general
diagramming skill for those.

## Workflow

1. **Classify the input** — identify which supported shape the user gave you
   (see [Input sources](#input-sources)). Parse it into a normalised
   `{ graph_nodes, graph_relationships }` object and validate it against
   [schemas/itom-graph.schema.json](schemas/itom-graph.schema.json).
2. **Resolve hierarchy** — walk `parent` links and emit a `group` node for every
   container (resource group, VNet, subnet, availability zone, service group)
   *before* its children. Preserve nesting depth with `parentId` + `extent`.
3. **Map CI types** — translate each CI class into an output node `type` using
   [references/ci-type-mapping.md](references/ci-type-mapping.md). Unmapped
   classes fall back to `generic`.
4. **Carry operational state** — copy `status` and normalise `metrics` into the
   node `data` object (see [references/data-model.md](references/data-model.md)).
5. **Derive edges** — map relationship types to edge semantics (colour,
   animation, label) using [references/data-model.md](references/data-model.md)
   and [references/rendering.md](references/rendering.md).
6. **Lay out** — assign non-overlapping `position` values; children use
   coordinates relative to their container and must stay inside it. See
   [references/rendering.md](references/rendering.md#layout-rules).
7. **Emit** — write the module (`svelte.js` / `.ts`) exporting `initialNodes` and
   `initialEdges`, and, when the user needs the visuals, the custom-node Svelte
   components from [references/rendering.md](references/rendering.md).
8. **Provide a browser preview** — ship [topology_viewer.html](topology_viewer.html),
   a standalone page that imports `./svelte.js` and renders the graph with the
   same template/interactions as [`azure_vnet_impact_topology.html`](azure_vnet_impact_topology.html),
   so web users can view the result with no build step. Serve the folder over
   HTTP (ES modules do not load from `file://`) and open the page:
   `python3 -m http.server 8000` → <http://localhost:8000/topology_viewer.html>.
   See [references/rendering.md](references/rendering.md#standalone-browser-preview).
9. **Validate** — run the [Validation checklist](#validation-checklist) before
   returning, then `node fixtures/verify.mjs` to machine-check the same
   contract (it also re-checks the canonical `svelte.js`).

## Output contract

Emit a single ES module:

```js
import { MarkerType } from '@xyflow/svelte';

export const initialNodes = [ /* ... */ ];
export const initialEdges = [ /* ... */ ];
```

When you are also delivering the custom node components, export a `nodeTypes`
map so the types referenced by the data resolve to components:

```js
import ServerNode from './nodes/ServerNode.svelte';
import DatabaseNode from './nodes/DatabaseNode.svelte';
import LoadBalancerNode from './nodes/LoadBalancerNode.svelte';
import CloudServiceNode from './nodes/CloudServiceNode.svelte';
import GroupNode from './nodes/GroupNode.svelte';

export const nodeTypes = {
  server: ServerNode,
  database: DatabaseNode,
  load_balancer: LoadBalancerNode,
  cloud_service: CloudServiceNode,
  group: GroupNode,
  generic: ServerNode
};
```

### Node shape (required fields)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable, unique. Reuse the input CI `id` / `sys_id`. |
| `type` | string | One of the mapped node types. Never leave `undefined`. |
| `position` | `{ x, y }` | Relative to `parentId` when nested. |
| `data.label` | string | Display name of the CI. |
| `data.ciType` | string | Original CI class, e.g. `cmdb_ci_linux_server`. |
| `data.status` | `'healthy'` \| `'warning'` \| `'error'` | Drives colour and animation. |
| `data.metrics` | object | Optional. CPU, memory, latency, throughput, incidents. |

Optional node fields: `parentId`, `extent: 'parent'`, `style`, `data.provider`,
`data.region`, `data.ip`, `data.fqdn`, `data.icon`, `data.details`.

Full field reference: [references/data-model.md](references/data-model.md).

### Edge shape (required fields)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable, unique, e.g. `e-{source}-{target}`. |
| `source` / `target` | string | Node ids that must exist in `initialNodes`. |
| `type` | string | `smoothstep` (default), `bezier`, `default`, or `straight`. |
| `data.category` | string | `dependency` \| `traffic` \| `impact` \| `secure` \| `replication`. |
| `label` | string | Protocol / port, e.g. `TCP/5432`. Omit if unknown. |

Optional edge fields: `animated`, `style`, `markerEnd`, `data.severity`,
`ariaLabel`.

## Presentation rules (summary)

- **Status palette** — healthy `#10b981`, warning `#f59e0b`, error `#ef4444`.
  Apply to the node accent, status dot, and any pulsing halo.
- **Edge behaviour** — `traffic` and `dependency` edges are `animated: true`;
  error/impact paths use red with `stroke-dasharray`; secure / private-link
  edges use emerald. Full mapping in
  [references/rendering.md](references/rendering.md).
- **Direction** — set `markerEnd: { type: MarkerType.ArrowClosed, color }` on
  directional dependencies.
- **Grouping** — container nodes use `type: 'group'` with a translucent fill
  and dashed border; children declare `parentId` + `extent: 'parent'`.

Rationale and exact values: [references/rendering.md](references/rendering.md).

## Input sources

| Input | Parser hint | Reference |
| --- | --- | --- |
| Normalised JSON (`graph_nodes` / `graph_relationships`) | direct | [schemas/itom-graph.schema.json](schemas/itom-graph.schema.json) |
| Neo4j / Cypher export | `id`, `labels[]`, `properties`, relationships `source`/`target`/`type` | [references/data-model.md](references/data-model.md) |
| Graphviz DOT | `digraph` nodes → CIs, `->` → relationships, attrs → properties | [references/data-model.md](references/data-model.md) |
| ServiceNow CMDB dump | `sys_id`, `sys_class_name`, `name`, `operational_status` | [references/ci-type-mapping.md](references/ci-type-mapping.md) |
| Svelte Flow module (passthrough) | re-validate and enrich in place | [svelte.js](svelte.js) |

## Validation checklist

Before returning, confirm:

- [ ] Every `edge.source` and `edge.target` resolves to a node `id`.
- [ ] Every `parentId` resolves to a `group` node and the child fits inside it.
- [ ] Every node has a `type` from the mapping table.
- [ ] Every node `data.status` is one of `healthy` / `warning` / `error`.
- [ ] No two sibling nodes overlap; all ids are unique.
- [ ] Edges that represent live traffic are `animated`.
- [ ] The module parses (valid JS syntax; JSON files contain no trailing commas).

## References

- [references/data-model.md](references/data-model.md) — every node/edge field, allowed values, metric units.
- [references/ci-type-mapping.md](references/ci-type-mapping.md) — CI class → node type / icon / colour across ServiceNow, Azure, AWS, OCI.
- [references/rendering.md](references/rendering.md) — Svelte Flow setup, custom node components, inspector panel, animations, and the standalone browser preview.
- [schemas/itom-graph.schema.json](schemas/itom-graph.schema.json) — JSON Schema for the normalised input.
- [svelte.js](svelte.js) — canonical output example.
- [web_data.json](web_data.json) — canonical input example.
- [fixtures/](fixtures/README.md) — the legacy v0 export (`networks.js`), its schema-valid conversion (`networks.normalised.json`), the expected output (`networks.svelte.js`) and `verify.mjs`, a dependency-free contract verifier (`node fixtures/verify.mjs`).
- [topology_viewer.html](topology_viewer.html) — standalone browser preview that renders `svelte.js` (or any module via `?module=`) using the same template as [`azure_vnet_impact_topology.html`](azure_vnet_impact_topology.html).
