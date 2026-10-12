# Fixtures

Regression inputs for the `itom-topology-flow` skill, plus a verifier that walks
each fixture through the whole pipeline.

| File | Role |
| --- | --- |
| `networks.js` | **Legacy raw input.** Lifted verbatim from `../azure_vnet_impact_topology.html`; exports `azureTopologyData` and deliberately breaks the input contract (see its header for the full list). |
| `networks.normalised.json` | The same topology converted to the input contract (`graph_nodes` / `graph_relationships`), valid against `../schemas/itom-graph.schema.json`. |
| `networks.svelte.js` | The skill **output** for that input (`initialNodes` / `initialEdges`), in the shape of `../svelte.js`. |
| `verify.mjs` | Dependency-free harness: raw → normalised → output → viewer geometry. |

## Run it

```bash
cd itom-ai-demo
node fixtures/verify.mjs        # exits non-zero on any contract violation
```

Preview the generated fixture in a browser (serve over HTTP, never `file://`):

```bash
python3 -m http.server 8000
# http://localhost:8000/topology_viewer.html?module=./fixtures/networks.svelte.js
```

`verify.mjs` reads the enums straight out of
`../schemas/itom-graph.schema.json` and the "Output node types (fixed
vocabulary)" list in `../references/ci-type-mapping.md`, so the docs, the schema
and the emitted data cannot drift apart silently. The canonical pair
(`../web_data.json` → `../svelte.js`) is put through the same stages, so
breaking the reference example fails the suite too.

## Raw → normalised node mapping

| Legacy field | Normalised home | Note |
| --- | --- | --- |
| `id` | `id` | Verbatim (`references/data-model.md` rule 1). |
| `name` | `properties.name` | Verbatim. |
| `type` (e.g. `Microsoft.Web/sites`) | `properties.resource_type` | A *resource type*, not a CMDB class, so no `ci_class` is invented: classification follows the "Azure resource types" table in `references/ci-type-mapping.md`. As no `ci_class` / `sys_class_name` exists, the emitted `data.ciType` falls back to the resource type, so `ciType` and `resourceType` match for every node here. |
| `icon` | `properties.icon` | Verbatim. An explicit source icon wins over the mapping default (e.g. `fa-cloud-arrow-up` on an App Service, which maps to `server`). |
| `status` | `properties.status` | Verbatim (already an enum value; all five nodes are `healthy` in the source). |
| `throughput` | `properties.metrics.throughput_mbps` | Unit made explicit. |
| `latency` | `properties.metrics.latency_ms` | Unit made explicit. |
| `ip` | `properties.ip` | Only when it really is an address. `'Azure Web App (PaaS)'` and `'PaaS Private Link Endpoint'` are prose, so they were dropped from `ip`; those cards fall back to `resourceType`. |
| `fqdn` | `properties.fqdn` | Verbatim. |
| `details` | `properties.details` | Verbatim. |
| `attachedTo: 'vm-orders-backend-01'` | *(note only)* | A **dangling** reference — that VM is not in the export, so no edge was invented; the fact survives in `details`. |
| `isExternal: true` | *(note only)* | Kept in `details`; it has no schema field. |
| `subnet: 'snet-integration-01'` etc. | `parent` + a new `Subnet` **group** | The three real subnet names became containers (workflow step 2). |
| `subnet: 'External PaaS'` | *(nothing)* | A sentinel rather than a subnet. `app-service-01` and `sqldb-external` therefore have **no** `parent` and stay top-level — which is exactly how the original demo drew them. No container was invented for it. |
| `vector` | *(dropped)* | Presentation-only direction hint; direction is already carried by the edges. |
| `x` / `y` | *(dropped, re-derived)* | Absolute canvas pixels have no place in the input contract. Layout is the generator's job (`references/rendering.md`); the fixture output keeps the legacy left→right column order. |

## Raw → normalised relationship mapping

| Legacy id | source → target | legacy `type` / `category` | output `type` | output `data.category` | colour | animated |
| --- | --- | --- | --- | --- | --- | --- |
| `e-app-delegation` | app-service-01 → vnet-int-interface | `fuchsia` / `outbound` | `SENDS_TRAFFIC_TO` | `traffic` | `#38bdf8` | yes |
| `e-int-vm` | vnet-int-interface → nic-vm-01 | `fuchsia` / `outbound` | `ROUTES_TO` | `traffic` | `#38bdf8` | yes |
| `e-int-pe` | vnet-int-interface → pe-sql-01 | `fuchsia` / `outbound` | `ROUTES_TO` | `traffic` | `#38bdf8` | yes |
| `e-vm-pe` | nic-vm-01 → pe-sql-01 | `sky` / `internal` | `DEPENDS_ON` | `dependency` | `#64748b` | yes |
| `e-pe-sqldb` | pe-sql-01 → sqldb-external | `sky` / `privatelink` | `PRIVATE_LINK` | `secure` | `#10b981` | no |

- Edge **ids are kept verbatim** so a row in the legacy demo can be traced to the
  new module; `e-{source}-{target}` in `references/data-model.md` is offered as
  an example shape, not a requirement.
- Legacy `type` was a *colour token* and legacy `category` used
  `outbound` / `internal` / `privatelink`, none of which exist in the schema
  enum. Colour is presentation state in the new contract, so the old fuchsia/sky
  distinction is intentionally replaced by the canonical category palette.
- Labels carry over; the port-bearing ones are normalised to the contract's
  `PROTOCOL/PORT` style: `'HTTP / Port 8080'` → `HTTP/8080`, and both
  `'SQL / Port 1433'` and `'Port 1433'` → `TCP/1433` (1433 is the SQL Server
  default). `'Outbound Swift Connection'` and `'Private Link Tunnel'` name no
  port, so they are kept verbatim.

## What `verify.mjs` asserts

| Stage | Checks |
| --- | --- |
| 1. raw fixture | Module imports; node/edge ids unique; every edge endpoint resolves. |
| 2. normalised input | JSON Schema constraints (allowed keys, enums, metric units, `parent` resolvability, unique ids) and **no leakage** of legacy-only fields. |
| 3. conversion fidelity | Node-id set preserved plus the expected new containers; sentinel `subnet` not turned into a container; dangling `attachedTo` not turned into an edge; every legacy edge mapped exactly once; no `ResourceGroup` container invented. |
| 4. output contract | The `SKILL.md` validation checklist: type vocabulary, groups emitted before children, containment, sibling overlap, palette / `ariaLabel` / `animated`, 2000×2000 bounds, `ciType` present. |
| 5. viewer geometry | Re-walks `parentId` exactly like `topology_viewer.html` and asserts finite, positive 160×56 boxes with child cards inside their container. |
