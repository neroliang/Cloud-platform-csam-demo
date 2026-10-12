# Rendering with Svelte Flow (@xyflow/svelte)

The data in [svelte.js](../svelte.js) is consumed by a Svelte Flow canvas. This
reference gives the host component, the custom node components, the styling
tokens, and the layout rules the generator must respect.

## Dependencies

```bash
npm install @xyflow/svelte
```

Import the base stylesheet once in the app entry:

```js
import '@xyflow/svelte/dist/style.css';
```

## Host component (`TopologyCanvas.svelte`)

Svelte 5 (runes) form:

```svelte
<script>
  import {
    SvelteFlow, Background, BackgroundVariant, Controls, MiniMap
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { initialNodes, initialEdges, nodeTypes } from './svelte.js';

  let nodes = $state(structuredClone(initialNodes));
  let edges = $state(structuredClone(initialEdges));
</script>

<div class="h-screen w-full bg-slate-950">
  <SvelteFlow bind:nodes bind:edges {nodeTypes} fitView>
    <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
    <Controls />
    <MiniMap />
  </SvelteFlow>
</div>
```

Svelte 4 equivalent: declare `let nodes = initialNodes; let edges = initialEdges;`
and use `bind:nodes bind:edges` — the API surface is the same.

`nodeTypes` is required whenever any node uses a `type` other than the built-ins
(`default`, `input`, `output`, `group`). Import it from `svelte.js` once you
uncomment the registry at the bottom of that file.

## Layout rules

The generator owns `position`; Svelte Flow does not auto-layout.

1. **Containers first.** Place every `group` node before its children, then give
   children `parentId` and `extent: 'parent'`.
2. **Child coordinates are relative** to the parent, not the canvas.
3. **Reserve the container box.** A group's `style` `width`/`height` must exceed
   the furthest child's `position + node size`. Assume CI nodes are **~160 × 56 px**.
   For a child at `(cx, cy)` the container must satisfy
   `width ≥ cx + 160 + padding` and `height ≥ cy + 56 + padding` (padding ≈ 24).
4. **Grid spacing.** Stack siblings with ≥ 40 px gutters, tiered top-to-bottom,
   left-to-right. Example for a subnet holding two nodes:

   ```js
   { position: { x: 20,  y: 70 } }   // first child
   { position: { x: 200, y: 70 } }   // second child (+180 px, same row)
   ```

5. **Never overlap** two sibling nodes or two sibling groups. If a container is
   full, raise its `height` rather than shrinking children.
6. Keep the whole graph within roughly `2000 × 2000` and rely on `fitView`.

### Reference geometry (matches svelte.js)

```
rg-orders-prod   (0,0)      680 × 420
└─ snet-workloads-01 (30,70)  → 380 × 170
   ├─ ci-web-01 (20,70)
   └─ ci-lb-01 (200,70)
├─ ci-db-01    (430,90)
└─ ci-store-01 (430,230)
```

## Styling tokens

### Status

| status | accent | dot class | halo |
| --- | --- | --- | --- |
| `healthy` | `#10b981` | `bg-emerald-400` | none |
| `warning` | `#f59e0b` | `bg-amber-400` | `animate-pulse` amber ring |
| `error` | `#ef4444` | `bg-red-500` | `animate-pulse` red ring |

### Edges by category

| category | colour | animated | stroke |
| --- | --- | --- | --- |
| `traffic` | `#38bdf8` | yes | solid 2px |
| `dependency` | `#64748b` | yes | solid 2px |
| `impact` / `critical` | `#ef4444` | yes | dashed `5,5` |
| `secure` | `#10b981` | no | solid 2px |
| `replication` | `#8b5cf6` | yes | dashed `8,6` |

Confirm section anchors referenced by [../SKILL.md](../SKILL.md) after edits:
`#layout-rules`.

## Custom node component (`nodes/CiNode.svelte`)

A single parametrised component covers `server`, `database`, `load_balancer`,
`cloud_service`, and `generic`; register it under each key in `nodeTypes`.

```svelte
<script>
  import { Handle, Position } from '@xyflow/svelte';
  export let data;
  export let selected = false;

  const STATUS = {
    healthy: { ring: '#10b981', dot: 'bg-emerald-400', pulse: '' },
    warning: { ring: '#f59e0b', dot: 'bg-amber-400', pulse: 'animate-pulse' },
    error: { ring: '#ef4444', dot: 'bg-red-500', pulse: 'animate-pulse' }
  };
  $: tone = STATUS[data.status] ?? STATUS.healthy;
  $: cpu = data.metrics?.cpu;
</script>

<div
  class="relative w-[160px] rounded-xl border bg-slate-900/80 p-2 text-slate-100
         {selected ? 'ring-2 ring-sky-400' : ''}"
  style="border-color: {tone.ring}"
>
  <Handle type="target" position={Position.Left} />
  <div class="flex items-center gap-2">
    <i class="fa-solid {data.icon ?? 'fa-server'}" style="color: {tone.ring}"></i>
    <span class="truncate text-xs font-semibold">{data.label}</span>
    <span class="ml-auto h-2.5 w-2.5 shrink-0 rounded-full {tone.dot} {tone.pulse}"></span>
  </div>
  {#if cpu != null}
    <div class="mt-1 font-mono text-[10px] text-slate-400">CPU {cpu}%</div>
  {/if}
  <Handle type="source" position={Position.Right} />
</div>
```

Svelte 5 form: replace `export let data;` with `let { data, selected = false } = $props();`.
The rest is unchanged.

### `nodes/GroupNode.svelte` (container)

Render the label in a header strip and let Svelte Flow draw the children on top:

```svelte
<script>
  export let data;
</script>

<div class="h-full w-full rounded-xl border border-dashed border-sky-500/40
            bg-sky-950/10 p-2">
  <div class="flex items-center justify-between border-b border-sky-500/20 pb-1">
    <span class="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
      {data.label}
    </span>
    {#if data.cidr}
      <span class="font-mono text-[10px] text-sky-300">{data.cidr}</span>
    {/if}
  </div>
</div>
```

## Inspector panel pattern

Mirror the click-to-inspect behaviour used by
[../azure_vnet_impact_topology.html](../azure_vnet_impact_topology.html): bind a
selected-node id on `on:nodeclick` and render metrics as bars.

```svelte
<script>
  let selectedId = $state(null);
  $: selected = nodes.find((n) => n.id === selectedId);
</script>

<SvelteFlow bind:nodes bind:edges {nodeTypes} {onnodeclick} fitView />

{#if selected}
  <aside class="absolute right-0 top-0 h-full w-96 border-l border-slate-800
                bg-slate-950/90 p-6">
    <h2 class="text-base font-semibold text-slate-100">{selected.data.label}</h2>
    <p class="font-mono text-xs text-sky-300">{selected.data.ip ?? '—'}</p>
    {#if selected.data.metrics?.latency_ms != null}
      <div class="mt-4 text-xs text-slate-400">
        RTT Latency
        <span class="float-right font-mono text-sky-400">
          {selected.data.metrics.latency_ms} ms
        </span>
      </div>
    {/if}
  </aside>
{/if}
```

## Animation & motion

- Rely on Svelte Flow's built-in animated edges (`animated: true`) for flowing
  dashes; no extra CSS required.
- For telemetry speed, drive a CSS variable on the edge data and map it to
  `animation-duration` (see the `dash-flow` keyframes in the HTML demo).
- Status halos use `animate-pulse` (Tailwind) or the `pulse-warning` /
  `pulse-error` box-shadow keyframes from the demo.

## Accessibility

- Always set `ariaLabel` on edges that carry a protocol/severity meaning.
- Never use colour alone: pair status colour with the status dot and, in the
  inspector, a text label (`Healthy` / `Warning` / `Error`).

## Standalone browser preview

[../topology_viewer.html](../topology_viewer.html) renders the emitted module with
**no build step**, so web users can open the result in a browser. It reuses the
same template and interactions as the original
[../azure_vnet_impact_topology.html](../azure_vnet_impact_topology.html) demo.

- Tailwind + Font Awesome + Inter/Fira Code from CDNs; dark slate theme with a
  grid backdrop.
- Header toolbar: relationship filters (`All Paths` / `Traffic Flow` /
  `Dependencies`), a `Flow` speed slider that drives `animation-duration`, a
  `Simulate Incident` toggle and `Reset`.
- `type: 'group'` nodes become container boxes; CI nodes become 160×56 cards
  positioned from absolute coordinates derived by walking the `parentId` chain.
- Every edge draws a dim base path plus a flowing animated path, with an arrow
  marker coloured from `markerEnd.color`.
- Clicking a CI opens the slide-in inspector (metrics rendered as bars) and lists
  its inbound/outbound relationships, matching the demo's click-to-inspect flow.

### Choosing the dataset

The page takes an optional `?module=` query parameter naming the ES module to
render, so any generated dataset can be previewed without editing the HTML:

```
http://localhost:8000/topology_viewer.html                                     # ./svelte.js
http://localhost:8000/topology_viewer.html?module=./fixtures/networks.svelte.js
```

The path is resolved relative to `topology_viewer.html`, and the header shows
which module is loaded. `Simulate Incident` prefers the canonical `ci-web-01`
path and otherwise degrades the first CI that has an outgoing traffic edge, so
the control stays useful for any dataset (see
[../fixtures/README.md](../fixtures/README.md) for the legacy fixture).

### Importing `svelte.js` without a bundler

`svelte.js` starts with `import { MarkerType } from '@xyflow/svelte'`. A plain
browser cannot resolve that bare specifier, so the page declares an import map
that points it at an inline module exposing the same constant:

```html
<script type="importmap">
  { "imports": {
      "@xyflow/svelte": "data:text/javascript,export%20const%20MarkerType%3D%7BArrow%3A%22arrow%22%2CArrowClosed%3A%22arrowclosed%22%7D%3B"
  } }
</script>
```

If a browser rejects the `data:` target, swap it for the real ESM build, e.g.
`https://esm.sh/@xyflow/svelte`.

### Serve over HTTP

Module scripts are blocked on `file://`, so open the folder through a static
server and load the page from `http://`:

```bash
cd itom-ai-demo
python3 -m http.server 8000
# then open http://localhost:8000/topology_viewer.html
```

The page shows a friendly overlay explaining this if the import is blocked.
