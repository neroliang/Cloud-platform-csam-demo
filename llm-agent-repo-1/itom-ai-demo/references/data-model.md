# ITOM graph data model

Field-level contract consumed and produced by the skill. Everything is plain
JSON/JS so it round-trips through Neo4j, ServiceNow, an HTTP API, or a Svelte
store without transformation.

## 1. Normalised input

```jsonc
{
  "metadata": {
    "source": "ServiceNow CMDB + Azure Resource Graph",
    "provider": "azure",            // azure | aws | oci | onprem | multi
    "region": "eastus",
    "environment": "Production",
    "root": "rg-orders-prod",
    "generated_at": "2026-11-10T00:00:00Z"
  },
  "graph_nodes": [
    {
      "id": "ci-web-01",
      "labels": ["ConfigurationItem"],
      "properties": {
        "name": "web-server-01.prod",
        "ci_class": "cmdb_ci_linux_server",
        "status": "healthy",
        "ip": "10.0.2.10",
        "metrics": { "cpu": 34, "memory": 58, "latency_ms": 1.2 }
      },
      "parent": "snet-workloads-01"
    }
  ],
  "graph_relationships": [
    {
      "id": "rel-02",
      "source": "ci-web-01",
      "target": "ci-db-01",
      "type": "DEPENDS_ON",
      "properties": { "protocol": "TCP/5432", "category": "dependency" }
    }
  ]
}
```

### `graph_nodes[]`

| Key | Required | Type | Description |
| --- | --- | --- | --- |
| `id` | yes | string | Stable unique id (CI `id` or `sys_id`). |
| `labels` | no | string[] | Taxonomy, e.g. `ConfigurationItem`, `ResourceGroup`, `Subnet`. Container labels drive group-node creation. |
| `properties` | yes | object | CI attributes (below). |
| `parent` | no | string | Id of the container node; becomes output `parentId`. |

`properties` fields:

| Key | Type | Maps to | Notes |
| --- | --- | --- | --- |
| `name` | string | `data.label` | Display name. |
| `ci_class` / `sys_class_name` | string | `data.ciType` + node `type` | See [ci-type-mapping.md](ci-type-mapping.md). |
| `status` | enum | `data.status` | `healthy` \| `warning` \| `error`. |
| `operational_status` | number | `data.status` | ServiceNow: 1 → healthy, 2 → warning, 3+ → error. |
| `metrics` | object | `data.metrics` | See [Metrics](#3-metrics). |
| `ip` | string | `data.ip` | IPv4 / IPv6 / DNS name. |
| `fqdn` | string | `data.fqdn` | Fully qualified hostname. |
| `provider` | string | `data.provider` | `azure` \| `aws` \| `oci`. |
| `region` | string | `data.region` | Cloud region. |
| `resource_type` | string | `data.resourceType` | Native type, e.g. `Microsoft.Web/sites`. |
| `cidr` | string | `data.cidr` | Only for subnet / VNet containers. |
| `icon` | string | `data.icon` | Font-Awesome class, e.g. `fa-database`. |
| `details` | string | `data.details` | Free-text operator note. |

### `graph_relationships[]`

| Key | Required | Type | Description |
| --- | --- | --- | --- |
| `id` | yes | string | Unique id. |
| `source` | yes | string | Source node id. |
| `target` | yes | string | Target node id. |
| `type` | yes | string | Verb, e.g. `DEPENDS_ON`, `ROUTES_TO`, `MEMBER_OF`, `RUNS_ON`. |
| `properties.protocol` | no | string | Edge `label`, e.g. `TCP/5432`. |
| `properties.category` | no | enum | `dependency` \| `traffic` \| `impact` \| `secure` \| `replication`. |
| `properties.traffic_rate` | no | enum | `low` \| `medium` \| `high` (drives animation speed). |
| `properties.severity` | no | enum | `info` \| `warning` \| `critical`. |

Relationship `type` → default `category` (override with explicit `category`):

| Relationship | Category | Animated | Colour |
| --- | --- | --- | --- |
| `ROUTES_TO`, `SENDS_TRAFFIC_TO`, `CONNECTS_TO` | `traffic` | yes | `#38bdf8` |
| `DEPENDS_ON`, `USES`, `READS_FROM`, `WRITES_TO` | `dependency` | yes | `#64748b` |
| `IMPACTS`, `AFFECTS`, `BLOCKS` | `impact` | yes | `#ef4444` |
| `SECURED_BY`, `PRIVATE_LINK`, `TUNNELS_TO` | `secure` | no | `#10b981` |
| `REPLICATES_TO`, `BACKS_UP_TO` | `replication` | yes | `#8b5cf6` |
| `MEMBER_OF`, `CONTAINS`, `RUNS_ON` | (hierarchy) | no | omit edge or dashed `#475569` |

## 2. Normalised output (Svelte Flow)

### Node

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `id` | yes | string | = input `id`. |
| `type` | yes | string | `server` \| `database` \| `load_balancer` \| `cloud_service` \| `group` \| `generic`. |
| `position` | yes | `{x:number,y:number}` | Relative to parent when nested. |
| `parentId` | no | string | Container node id. |
| `extent` | no | `'parent'` | Clamp child inside its container. |
| `style` | no | string | Inline CSS — used for group boxes. |
| `data.label` | yes | string | Display name. |
| `data.ciType` | yes | string | Original CI class. |
| `data.status` | yes | enum | `healthy` \| `warning` \| `error`. |
| `data.metrics` | no | object | See [Metrics](#3-metrics). |
| `data.provider` | no | string | `azure` \| `aws` \| `oci`. |
| `data.region` | no | string | Cloud region. |
| `data.ip` | no | string | Address. |
| `data.fqdn` | no | string | Hostname. |
| `data.resourceType` | no | string | Native resource type. |
| `data.icon` | no | string | Font-Awesome class. |
| `data.kind` | no | string | For groups: `resource_group`, `vnet`, `subnet`, `zone`. |
| `data.details` | no | string | Operator note. |

### Edge

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `id` | yes | string | e.g. `e-{source}-{target}`. |
| `source` / `target` | yes | string | Must resolve to node ids. |
| `type` | yes | string | `smoothstep` (default) \| `bezier` \| `default` \| `straight`. |
| `animated` | no | boolean | `true` for live traffic / dependency flows. |
| `label` | no | string | Protocol / port. |
| `style` | no | string | `stroke`, `stroke-width`, `stroke-dasharray`. |
| `markerEnd` | no | object | `{ type: MarkerType.ArrowClosed, color }`. |
| `data.category` | yes | enum | Same enum as the input. |
| `data.severity` | no | enum | `info` \| `warning` \| `critical`. |
| `ariaLabel` | no | string | Accessible description. |

## 3. Metrics

| Metric key | Unit | Range | Render as |
| --- | --- | --- | --- |
| `cpu` | percent | 0–100 | progress bar + `34%` |
| `memory` | percent | 0–100 | progress bar + `58%` |
| `latency_ms` | milliseconds | ≥ 0 | `1.2 ms` |
| `throughput_mbps` | Mbps | ≥ 0 | `320 Mbps` |
| `incidents` | count | ≥ 0 | amber/red badge |

Values are stored as **numbers** (not strings) so widgets can compute
percentages. Format for display in the node component, never in the data.

## 4. Normalisation rules

1. Keep ids verbatim; never rewrite `sys_id`.
2. `parent` must reference an existing node, else drop it (never emit a dangling
   `parentId`).
3. A node whose `labels` include `ResourceGroup`, `VNet`, `Subnet`, or
   `AvailabilityZone` becomes a `group` node.
4. Emit groups before their children in `initialNodes` so Svelte Flow resolves
   `parentId` on first render.
5. Collapse duplicate `source → target` pairs of the same relationship type;
   keep the highest severity.
