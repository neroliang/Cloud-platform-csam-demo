#!/usr/bin/env node
/**
 * Contract verifier for the `itom-topology-flow` skill.
 *
 *   node fixtures/verify.mjs
 *
 * Every fixture is walked through the real pipeline and each stage is checked
 * against the published contract. The enums are read *out of* the schema and
 * the reference docs rather than duplicated here, so docs, schema and emitted
 * data cannot drift apart silently.
 *
 *   stage 1  raw fixture            (fixtures/networks.js)
 *   stage 2  normalised input       (JSON Schema constraints)
 *   stage 3  conversion fidelity    (legacy field -> contract field)
 *   stage 4  output contract        (SKILL.md validation checklist)
 *   stage 5  viewer geometry        (the parentId walk topology_viewer.html uses)
 *
 * Stages 2-5 also run for the canonical pair web_data.json -> svelte.js, so
 * breaking the reference example fails the suite.
 *
 * No dependencies: the bare `@xyflow/svelte` specifier in the emitted module is
 * rewritten to a stub in a temp dir (the browser preview uses an import map
 * instead - see references/rendering.md).
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = join(HERE, '..');
const read = (rel) => readFileSync(join(DEMO_ROOT, rel), 'utf8');

// ---------------------------------------------------------------------------
// Contract constants, derived from the published docs + schema
// ---------------------------------------------------------------------------
const schema = JSON.parse(read('schemas/itom-graph.schema.json'));
const defs = schema.$defs;
const ROOT_KEYS = Object.keys(schema.properties);
const ROOT_REQUIRED = schema.required;
const NODE_KEYS = Object.keys(defs.node.properties);
const REL_KEYS = Object.keys(defs.relationship.properties);
// NOTE: a relationship's own `properties` bag is itself described by a schema
// object with a `properties` map, hence the triple hop.
const REL_PROP_KEYS_OBJ = defs.relationship.properties.properties.properties;
const REL_PROP_KEYS = Object.keys(REL_PROP_KEYS_OBJ);
const METRIC_KEYS = Object.keys(defs.metrics.properties);
const METRIC_BOUNDS = defs.metrics.properties;
const STATUSES = defs.status.enum;
const CATEGORIES = REL_PROP_KEYS_OBJ.category.enum;
const TRAFFIC_RATES = REL_PROP_KEYS_OBJ.traffic_rate.enum;
const SEVERITIES = REL_PROP_KEYS_OBJ.severity.enum;
const PROVIDERS = defs.metadata.properties.provider.enum;

const ciMapping = read('references/ci-type-mapping.md');
const vocabularySection = ciMapping.split('## Output node types (fixed vocabulary)')[1] ?? '';
// The vocabulary paragraph is the first one holding >= 3 backticked tokens
// (skips the intro sentence, which only mentions `nodeTypes` and `type`).
const vocabularyLine = vocabularySection
  .split('\n\n')
  .map((s) => s.trim())
  .find((s) => (s.match(/`[a-z_]+`/g) ?? []).length >= 3);
const NODE_TYPES = [...(vocabularyLine ?? '').matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);

const skill = read('SKILL.md');
const edgeTypeRow = skill.split('\n').find((l) => l.startsWith('| `type` | string | `smoothstep`')) ?? '';
const EDGE_TYPES = [...edgeTypeRow.matchAll(/`([a-z]+)`/g)].map((m) => m[1]);

// "### Edges by category" table in references/rendering.md -> palette + motion.
const PALETTE = {};
const ANIMATED_BY_DEFAULT = {};
for (const line of read('references/rendering.md').split('\n')) {
  const m = line.match(/^\|\s*`([a-z_]+)`[^|]*\|\s*`(#[0-9a-fA-F]{6})`\s*\|\s*(yes|no)\s*\|/);
  if (m) {
    PALETTE[m[1]] = m[2];
    ANIMATED_BY_DEFAULT[m[1]] = m[3] === 'yes';
  }
}

// ---------------------------------------------------------------------------
// Expectations for the legacy fixture (kept next to the mapping table)
// ---------------------------------------------------------------------------
const LEGACY_ONLY_KEYS = ['x', 'y', 'vector', 'isExternal', 'attachedTo', 'throughput', 'latency', 'subnet'];
const CONTAINER_LABELS = ['ResourceGroup', 'VNet', 'Subnet', 'AvailabilityZone'];
const SUBNET_SENTINEL = /^snet-/;
const NODE_W = 160;
const NODE_H = 56;
const VIEWER_OFFSET = { x: 48, y: 36 };
const CANVAS_LIMIT = 2000;

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------
const log = [];
let stageName = '';
const stage = (name) => {
  stageName = name;
  log.push({ kind: 'stage', text: name });
};
const check = (label, condition, detail = '') =>
  log.push({ kind: condition ? 'ok' : 'fail', text: label, detail: String(detail), stage: stageName });
const warn = (label, detail = '') => log.push({ kind: 'warn', text: label, detail: String(detail), stage: stageName });
const section = (name) => log.push({ kind: 'section', text: name });
const info = (text) => log.push({ kind: 'info', text, stage: stageName });

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------
const TMP = mkdtempSync(join(tmpdir(), 'itom-verify-'));
const STUB = join(TMP, 'xyflow-stub.mjs');
writeFileSync(STUB, "export const MarkerType = { Arrow: 'arrow', ArrowClosed: 'arrowclosed' };\n");

let moduleSeq = 0;
async function loadModule(rel) {
  const rewritten = read(rel).replace(
    /from\s+(['"])@xyflow\/svelte\1/g,
    `from ${JSON.stringify(pathToFileURL(STUB).href)}`
  );
  const target = join(TMP, `module-${(moduleSeq += 1)}.mjs`);
  writeFileSync(target, rewritten);
  return import(pathToFileURL(target).href);
}

// ---------------------------------------------------------------------------
// Geometry + value helpers (these mirror topology_viewer.html)
// ---------------------------------------------------------------------------
const nodeSize = (node) => {
  if (node.type !== 'group') return { w: NODE_W, h: NODE_H };
  const style = node.style ?? '';
  return {
    w: Number(/width:\s*(\d+(?:\.\d+)?)px/.exec(style)?.[1]),
    h: Number(/height:\s*(\d+(?:\.\d+)?)px/.exec(style)?.[1])
  };
};

const absPosition = (node, nodes) => {
  let x = node.position?.x ?? 0;
  let y = node.position?.y ?? 0;
  let cursor = node;
  for (let guard = 0; cursor?.parentId && guard < 32; guard += 1) {
    const parent = nodes.find((n) => n.id === cursor.parentId);
    if (!parent) break;
    x += parent.position?.x ?? 0;
    y += parent.position?.y ?? 0;
    cursor = parent;
  }
  return { x, y };
};

const rectOf = (node, nodes) => {
  const { x, y } = absPosition(node, nodes);
  const { w, h } = nodeSize(node);
  return { x, y, w, h, right: x + w, bottom: y + h };
};

const overlaps = (a, b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
const colourOf = (edge) => /#[0-9a-fA-F]{6}/.exec(edge.style ?? '')?.[0]?.toLowerCase();
const isAddress = (v) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(v);

function findKeys(value, keys, path = '$', found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [k, v] of Object.entries(value)) {
    if (keys.includes(k)) found.push(`${path}.${k}`);
    findKeys(v, keys, `${path}.${k}`, found);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Stage 1 - the legacy raw fixture is really in the old shape
// ---------------------------------------------------------------------------
function checkRawFixture(raw) {
  stage('stage 1 - legacy raw fixture');
  const data = raw?.azureTopologyData;
  check('networks.js exports azureTopologyData', Boolean(data));
  if (!data) return;

  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];
  check('exposes nodes + edges arrays', nodes.length > 0 && edges.length > 0, `${nodes.length} nodes / ${edges.length} edges`);

  const ids = nodes.map((n) => n.id);
  check('node ids are unique', new Set(ids).size === ids.length);
  check('edge ids are unique', new Set(edges.map((e) => e.id)).size === edges.length);
  const dangling = edges.filter((e) => !ids.includes(e.source) || !ids.includes(e.target));
  check('every legacy edge endpoint resolves', dangling.length === 0, dangling.map((e) => e.id).join(', '));

  // The incompatibilities below are what make this fixture worth running: each
  // one asserts the *legacy* shape is still the legacy shape.
  check('legacy nodes are flat (no properties/parent)', nodes.every((n) => !('properties' in n) && !('parent' in n)));
  check('legacy metrics are flat numbers', nodes.every((n) => typeof n.throughput === 'number' && typeof n.latency === 'number'));
  check('legacy `type` is a cloud resource type', nodes.every((n) => /^(Microsoft|AWS|oci)/.test(n.type)));
  const legacyCategories = [...new Set(edges.map((e) => e.category))];
  check('legacy categories are outside the schema enum', legacyCategories.every((c) => !CATEGORIES.includes(c)), legacyCategories.join(' / '));
  check('legacy edge `type` is a colour token', edges.every((e) => /^(fuchsia|sky)$/.test(e.type)), [...new Set(edges.map((e) => e.type))].join(' / '));
  check(
    'some subnet value is not a real snet-* name (the sentinel)',
    nodes.some((n) => !SUBNET_SENTINEL.test(n.subnet)),
    [...new Set(nodes.map((n) => n.subnet))].join(' / ')
  );
  check('legacy dangling attachedTo is present', nodes.some((n) => n.attachedTo && !ids.includes(n.attachedTo)));
  check('legacy absolute canvas coords are present', nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
}

// ---------------------------------------------------------------------------
// Stage 2 - the normalised document satisfies the published JSON Schema
// ---------------------------------------------------------------------------
function checkInput(doc, label) {
  stage(`stage 2 - normalised input (${label})`);
  const rootKeys = Object.keys(doc);
  check('root keys are schema keys', rootKeys.every((k) => ROOT_KEYS.includes(k)), rootKeys.join(', '));
  check('required root keys present', ROOT_REQUIRED.every((k) => k in doc), ROOT_REQUIRED.join(', '));
  if (doc.metadata?.provider !== undefined) {
    check('metadata.provider in enum', PROVIDERS.includes(doc.metadata.provider), doc.metadata.provider);
  }

  const nodes = doc.graph_nodes ?? [];
  const rels = doc.graph_relationships ?? [];
  const ids = nodes.map((n) => n.id);
  check('node ids unique + non-empty', new Set(ids).size === ids.length && ids.every((id) => typeof id === 'string' && id.length > 0));
  check('relationship ids unique + non-empty', new Set(rels.map((r) => r.id)).size === rels.length);
  check('every node declares properties', nodes.every((n) => n.properties && typeof n.properties === 'object'));

  nodes.forEach((n) => {
    const extra = Object.keys(n).filter((k) => !NODE_KEYS.includes(k));
    check(`${n.id}: node keys are schema keys`, extra.length === 0, extra.join(', '));
    if (n.parent !== undefined) check(`${n.id}: parent resolves`, ids.includes(n.parent), n.parent);

    const p = n.properties ?? {};
    if (p.status !== undefined) check(`${n.id}: status in enum`, STATUSES.includes(p.status), p.status);
    if (p.ip !== undefined) check(`${n.id}: ip is an address`, isAddress(p.ip), p.ip);
    if (p.metrics !== undefined) {
      const bad = Object.keys(p.metrics).filter((k) => !METRIC_KEYS.includes(k));
      check(`${n.id}: metric keys allowed`, bad.length === 0, bad.join(', '));
      const outOfRange = Object.entries(p.metrics).filter(([k, v]) => {
        const bounds = METRIC_BOUNDS[k] ?? {};
        if (typeof v !== 'number') return true;
        if (bounds.minimum !== undefined && v < bounds.minimum) return true;
        if (bounds.maximum !== undefined && v > bounds.maximum) return true;
        return false;
      });
      check(`${n.id}: metric values in range`, outOfRange.length === 0, outOfRange.map(([k, v]) => `${k}=${v}`).join(', '));
    }
  });

  rels.forEach((r) => {
    const extra = Object.keys(r).filter((k) => !REL_KEYS.includes(k));
    check(`${r.id}: relationship keys are schema keys`, extra.length === 0, extra.join(', '));
    check(
      `${r.id}: source/target/type are non-empty strings`,
      ['source', 'target', 'type'].every((k) => typeof r[k] === 'string' && r[k].length > 0)
    );
    check(`${r.id}: endpoints resolve`, ids.includes(r.source) && ids.includes(r.target), `${r.source} -> ${r.target}`);

    const p = r.properties ?? {};
    const badProps = Object.keys(p).filter((k) => !REL_PROP_KEYS.includes(k));
    check(`${r.id}: relationship property keys allowed`, badProps.length === 0, badProps.join(', '));
    check(`${r.id}: category present + in enum`, CATEGORIES.includes(p.category), String(p.category));
    if (p.traffic_rate !== undefined) check(`${r.id}: traffic_rate in enum`, TRAFFIC_RATES.includes(p.traffic_rate), p.traffic_rate);
    if (p.severity !== undefined) check(`${r.id}: severity in enum`, SEVERITIES.includes(p.severity), p.severity);
  });

  // Nothing may reference a parent that is not a container node.
  nodes
    .filter((n) => n.parent)
    .forEach((n) =>
      check(
        `${n.id}: parent is a container node`,
        (nodes.find((p) => p.id === n.parent)?.labels ?? []).some((l) => CONTAINER_LABELS.includes(l)),
        String(n.parent)
      )
    );

  const leaked = findKeys(doc, LEGACY_ONLY_KEYS);
  check('no legacy-only field leaked into the contract', leaked.length === 0, leaked.join(', '));
}

// ---------------------------------------------------------------------------
// Stage 3 - the conversion is faithful: nothing invented, nothing lost
// ---------------------------------------------------------------------------
function checkConversion(raw, doc, out) {
  stage('stage 3 - conversion fidelity');
  const rawNodes = raw.azureTopologyData.nodes;
  const rawEdges = raw.azureTopologyData.edges;
  const nodeById = new Map(doc.graph_nodes.map((n) => [n.id, n]));
  const containers = doc.graph_nodes.filter((n) => (n.labels ?? []).some((l) => CONTAINER_LABELS.includes(l)));
  const containerIds = new Set(containers.map((n) => n.id));
  const outById = new Map(out.initialEdges.map((e) => [e.id, e]));

  // -- identifiers --------------------------------------------------------
  check(
    'every legacy CI id survives',
    rawNodes.every((n) => nodeById.has(n.id)),
    rawNodes.filter((n) => !nodeById.has(n.id)).map((n) => n.id).join(', ')
  );
  check(
    'no CI id was invented',
    [...nodeById.keys()].every((id) => rawNodes.some((n) => n.id === id) || containerIds.has(id)),
    [...nodeById.keys()].filter((id) => !rawNodes.some((n) => n.id === id) && !containerIds.has(id)).join(', ')
  );

  // -- containers (workflow step 2) ---------------------------------------
  const expected = [...new Set(rawNodes.map((n) => n.subnet))].filter((s) => SUBNET_SENTINEL.test(s));
  check('a container was derived for every real subnet name', expected.every((s) => containerIds.has(s)), expected.join(', '));
  check(
    'no container invented beyond the real subnet names',
    containers.length === expected.length && containers.every((c) => expected.includes(c.id)),
    containers.map((c) => c.id).join(', ')
  );
  check('no ResourceGroup / VNet container invented', !containers.some((c) => !c.id.startsWith('snet-')));

  const sentinelNodes = rawNodes.filter((n) => !SUBNET_SENTINEL.test(n.subnet)).map((n) => n.id);
  check('the sentinel subnet did not become a container', sentinelNodes.every((id) => !containerIds.has(id)));
  check(
    'sentinel subnet nodes stay top-level (no parent)',
    sentinelNodes.every((id) => nodeById.get(id).parent === undefined),
    sentinelNodes.join(', ')
  );
  check(
    'real subnet nodes are parented to their subnet',
    rawNodes.filter((n) => SUBNET_SENTINEL.test(n.subnet)).every((n) => nodeById.get(n.id).parent === n.subnet)
  );

  // -- field moves --------------------------------------------------------
  check(
    'flat throughput/latency moved into properties.metrics',
    rawNodes.every(
      (n) =>
        nodeById.get(n.id).properties.metrics.throughput_mbps === n.throughput &&
        nodeById.get(n.id).properties.metrics.latency_ms === n.latency
    )
  );
  check('legacy `type` moved into properties.resource_type', rawNodes.every((n) => nodeById.get(n.id).properties.resource_type === n.type));
  check('names preserved', rawNodes.every((n) => nodeById.get(n.id).properties.name === n.name));
  check('icons preserved', rawNodes.every((n) => nodeById.get(n.id).properties.icon === n.icon));
  check('status preserved', rawNodes.every((n) => nodeById.get(n.id).properties.status === n.status));
  check('fqdn preserved where present', rawNodes.filter((n) => n.fqdn).every((n) => nodeById.get(n.id).properties.fqdn === n.fqdn));
  check(
    'ip kept only when it really is an address',
    rawNodes.every((n) => {
      const ip = nodeById.get(n.id).properties.ip;
      return ip === undefined ? !isAddress(n.ip) : ip === n.ip;
    })
  );

  // -- relationships ------------------------------------------------------
  check(
    'every legacy edge id is preserved',
    rawEdges.every((e) => outById.has(e.id)),
    rawEdges.filter((e) => !outById.has(e.id)).map((e) => e.id).join(', ')
  );
  check('no edge invented', out.initialEdges.length === rawEdges.length, `${out.initialEdges.length} emitted vs ${rawEdges.length} legacy`);
  check('edge endpoints are untouched', rawEdges.every((e) => outById.get(e.id).source === e.source && outById.get(e.id).target === e.target));
  check('every emitted edge carries a schema category', out.initialEdges.every((e) => CATEGORIES.includes(e.data?.category)));
  check('legacy colour tokens are gone from the edges', rawEdges.every((e) => outById.get(e.id).data.category !== e.type));

  // -- dangling reference -------------------------------------------------
  const dangling = rawNodes.filter((n) => n.attachedTo && !rawNodes.some((m) => m.id === n.attachedTo));
  check('the source still contains a dangling reference', dangling.length > 0, dangling.map((n) => `${n.id} -> ${n.attachedTo}`).join(', '));
  const known = new Set([...rawNodes.map((n) => n.id), ...containerIds]);
  check('no emitted edge points at an unknown node', out.initialEdges.every((e) => known.has(e.source) && known.has(e.target)));
  check(
    'the dangling reference survives as a details note',
    dangling.every((n) => (nodeById.get(n.id).properties.details ?? '').includes(n.attachedTo))
  );
}

// ---------------------------------------------------------------------------
// Stage 4 - output contract + the SKILL.md validation checklist
// ---------------------------------------------------------------------------
function checkOutput(out, input, label) {
  stage(`stage 4 - output contract (${label})`);
  const nodes = out.initialNodes ?? [];
  const edges = out.initialEdges ?? [];
  check('exports initialNodes', Array.isArray(out.initialNodes) && nodes.length > 0);
  check('exports initialEdges', Array.isArray(out.initialEdges) && edges.length > 0);
  check('exports STATUS_TOKENS', Boolean(out.STATUS_TOKENS));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  check('node ids are unique', byId.size === nodes.length);
  check('edge ids are unique', new Set(edges.map((e) => e.id)).size === edges.length);
  check('every node declares a type', nodes.every((n) => typeof n.type === 'string' && n.type.length > 0));
  check(
    'node types come from the documented vocabulary',
    nodes.every((n) => NODE_TYPES.includes(n.type)),
    [...new Set(nodes.filter((n) => !NODE_TYPES.includes(n.type)).map((n) => n.type))].join(', ')
  );
  check('every node declares a numeric position', nodes.every((n) => Number.isFinite(n.position?.x) && Number.isFinite(n.position?.y)));
  check(
    'group nodes are emitted before their children',
    nodes.every((n, i) => !n.parentId || nodes.findIndex((p) => p.id === n.parentId) < i),
    nodes.filter((n, i) => n.parentId && nodes.findIndex((p) => p.id === n.parentId) > i).map((n) => n.id).join(', ')
  );
  const groups = nodes.filter((n) => n.type === 'group');
  check('group nodes declare a width + height', groups.every((n) => Number.isFinite(nodeSize(n).w) && Number.isFinite(nodeSize(n).h)));
  check('every parentId resolves to a group node', nodes.filter((n) => n.parentId).every((n) => byId.get(n.parentId)?.type === 'group'));
  check('nested nodes declare extent: "parent"', nodes.filter((n) => n.parentId).every((n) => n.extent === 'parent'));

  // Containment (rendering.md rule 3) + sibling overlap (rule 5).
  nodes
    .filter((n) => n.parentId)
    .forEach((n) => {
      const box = rectOf(n, nodes);
      const parent = rectOf(byId.get(n.parentId), nodes);
      check(
        `${n.id} fits inside ${n.parentId}`,
        box.x >= parent.x && box.y >= parent.y && box.right <= parent.right && box.bottom <= parent.bottom,
        `${JSON.stringify(box)} vs container ${JSON.stringify(parent)}`
      );
    });

  const siblings = new Map();
  nodes.forEach((n) => {
    const key = n.parentId ?? '(root)';
    siblings.set(key, [...(siblings.get(key) ?? []), n]);
  });
  siblings.forEach((list) => {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        check(`${list[i].id} / ${list[j].id} do not overlap`, !overlaps(rectOf(list[i], nodes), rectOf(list[j], nodes)));
      }
    }
  });

  // CI payload.
  const cis = nodes.filter((n) => n.type !== 'group');
  check('every CI declares data.label', cis.every((n) => typeof n.data?.label === 'string' && n.data.label.length > 0));
  check('every CI declares data.ciType', cis.every((n) => typeof n.data?.ciType === 'string' && n.data.ciType.length > 0));
  check('every CI declares data.icon', cis.every((n) => typeof n.data?.icon === 'string' && n.data.icon.length > 0));
  check(
    'every CI status is in the enum',
    cis.every((n) => STATUSES.includes(n.data?.status)),
    [...new Set(cis.filter((n) => !STATUSES.includes(n.data?.status)).map((n) => n.id))].join(', ')
  );
  if (input?.metadata?.provider) {
    check('every CI inherits metadata.provider', cis.every((n) => n.data.provider === input.metadata.provider));
  }

  // Edges.
  check(
    'every edge endpoint resolves',
    edges.every((e) => byId.has(e.source) && byId.has(e.target)),
    edges.filter((e) => !byId.has(e.source) || !byId.has(e.target)).map((e) => e.id).join(', ')
  );
  check(
    'every edge type is a documented Svelte Flow type',
    edges.every((e) => EDGE_TYPES.includes(e.type)),
    [...new Set(edges.map((e) => e.type))].join(', ')
  );
  check('every edge declares a schema category', edges.every((e) => CATEGORIES.includes(e.data?.category)));
  check('every edge declares an ariaLabel', edges.every((e) => typeof e.ariaLabel === 'string' && e.ariaLabel.length > 0));

  edges.forEach((e) => {
    const expected = e.data?.severity === 'critical' ? '#ef4444' : PALETTE[e.data?.category];
    check(`${e.id}: stroke matches the category palette`, colourOf(e) === expected, `${colourOf(e)} vs ${expected}`);
    check(`${e.id}: markerEnd matches the stroke colour`, e.markerEnd?.color?.toLowerCase() === colourOf(e), String(e.markerEnd?.color));
    if (e.data?.severity === 'critical') check(`${e.id}: critical edges are dashed`, /stroke-dasharray/.test(e.style ?? ''));
  });

  check('traffic edges are animated', edges.filter((e) => e.data?.category === 'traffic').every((e) => e.animated === true));
  check('secure edges are not animated', edges.filter((e) => e.data?.category === 'secure').every((e) => e.animated !== true));
  const staticDeps = edges.filter((e) => e.data?.category === 'dependency' && e.animated !== true);
  if (staticDeps.length) warn('dependency edges are not animated (rendering.md suggests animated: true)', staticDeps.map((e) => e.id).join(', '));

  const boxes = nodes.map((n) => rectOf(n, nodes));
  const width = Math.max(...boxes.map((b) => b.right));
  const height = Math.max(...boxes.map((b) => b.bottom));
  check(`graph fits inside ${CANVAS_LIMIT} x ${CANVAS_LIMIT}`, width <= CANVAS_LIMIT && height <= CANVAS_LIMIT, `${Math.round(width)} x ${Math.round(height)}`);
}

// ---------------------------------------------------------------------------
// Stage 5 - topology_viewer.html can actually draw it
// ---------------------------------------------------------------------------
// The viewer walks `parentId` and then adds OFFSET_X/OFFSET_Y to *every* node,
// so containment is offset-invariant; only the reported canvas extent needs it.
const MIN_GUTTER = 8;

function checkViewer(out, label) {
  stage(`stage 5 - viewer geometry (${label})`);
  const nodes = out.initialNodes ?? [];
  const edges = out.initialEdges ?? [];
  const boxes = nodes.map((n) => ({ id: n.id, ...rectOf(n, nodes) }));

  check(
    'every node resolves to a finite absolute position',
    boxes.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y)),
    boxes.filter((b) => !Number.isFinite(b.x) || !Number.isFinite(b.y)).map((b) => b.id).join(', ')
  );
  check(
    'every node has a positive finite size',
    boxes.every((b) => Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0),
    boxes.filter((b) => !Number.isFinite(b.w) || !Number.isFinite(b.h) || b.w <= 0 || b.h <= 0).map((b) => b.id).join(', ')
  );
  check('no node lands at a negative coordinate', boxes.every((b) => b.x >= 0 && b.y >= 0));

  nodes
    .filter((n) => n.parentId)
    .forEach((n) => {
      const box = rectOf(n, nodes);
      const parent = rectOf(nodes.find((p) => p.id === n.parentId), nodes);
      check(
        `${n.id} keeps a visible gutter inside ${n.parentId}`,
        box.x >= parent.x + MIN_GUTTER &&
          box.y >= parent.y + MIN_GUTTER &&
          box.right <= parent.right - MIN_GUTTER &&
          box.bottom <= parent.bottom - MIN_GUTTER,
        `gutters x=${box.x - parent.x} y=${box.y - parent.y} right=${parent.right - box.right} bottom=${parent.bottom - box.bottom}`
      );
    });

  const canvas = {
    w: Math.round(Math.max(...boxes.map((b) => b.right)) + VIEWER_OFFSET.x),
    h: Math.round(Math.max(...boxes.map((b) => b.bottom)) + VIEWER_OFFSET.y)
  };
  check('canvas fits the viewport budget', canvas.w <= CANVAS_LIMIT && canvas.h <= CANVAS_LIMIT, `${canvas.w} x ${canvas.h}`);

  const centres = new Map(boxes.map((b) => [b.id, { x: b.x + b.w / 2, y: b.y + b.h / 2 }]));
  check(
    'no edge has coincident endpoints (anchor maths needs dx or dy)',
    edges.every((e) => {
      const s = centres.get(e.source);
      const t = centres.get(e.target);
      return s && t && (s.x !== t.x || s.y !== t.y);
    }),
    edges
      .filter((e) => {
        const s = centres.get(e.source);
        const t = centres.get(e.target);
        return !s || !t || (s.x === t.x && s.y === t.y);
      })
      .map((e) => e.id)
      .join(', ')
  );

  const groups = nodes.filter((n) => n.type === 'group').length;
  info(`${nodes.length - groups} CIs in ${groups} containers, ${edges.length} edges, canvas ~${canvas.w} x ${canvas.h}`);
}

// ---------------------------------------------------------------------------
// Report + main
// ---------------------------------------------------------------------------
function report() {
  const perStage = new Map();
  for (const entry of log) {
    if (entry.kind !== 'ok' && entry.kind !== 'fail') continue;
    const tally = perStage.get(entry.stage) ?? { ok: 0, fail: 0 };
    tally[entry.kind] += 1;
    perStage.set(entry.stage, tally);
  }

  for (const entry of log) {
    if (entry.kind === 'section') {
      console.log(`\n${'='.repeat(74)}\n${entry.text}\n${'='.repeat(74)}`);
    } else if (entry.kind === 'stage') {
      const tally = perStage.get(entry.text) ?? { ok: 0, fail: 0 };
      console.log(`\n-- ${entry.text}  [${tally.ok} ok${tally.fail ? `, ${tally.fail} FAILED` : ''}]`);
    } else if (entry.kind === 'fail') {
      console.log(`   FAIL  ${entry.text}${entry.detail ? ` -> ${entry.detail}` : ''}`);
    } else if (entry.kind === 'warn') {
      console.log(`   WARN  ${entry.text}${entry.detail ? ` -> ${entry.detail}` : ''}`);
    } else if (entry.kind === 'info') {
      console.log(`   info  ${entry.text}`);
    }
  }

  const ok = log.filter((e) => e.kind === 'ok').length;
  const failed = log.filter((e) => e.kind === 'fail').length;
  const warned = log.filter((e) => e.kind === 'warn').length;
  console.log(`\n${'-'.repeat(74)}`);
  console.log(`${ok} checks passed, ${failed} failed, ${warned} advisory`);
  console.log(failed === 0 ? 'RESULT: the contract holds for every fixture.' : 'RESULT: contract violations found.');
  process.exitCode = failed === 0 ? 0 : 1;
}

const PAIRS = [
  { name: 'canonical pair: web_data.json -> svelte.js', input: 'web_data.json', output: 'svelte.js' },
  {
    name: 'legacy fixture: networks.js -> networks.normalised.json -> networks.svelte.js',
    raws: 'fixtures/networks.js',
    input: 'fixtures/networks.normalised.json',
    output: 'fixtures/networks.svelte.js'
  }
];

async function main() {
  console.log('itom-topology-flow contract verifier');
  console.log(`  schema categories : ${CATEGORIES.join(', ')}`);
  console.log(`  node type vocab   : ${NODE_TYPES.join(', ')}`);
  console.log(`  edge palette      : ${Object.entries(PALETTE).map(([k, v]) => `${k}=${v}`).join('  ')}`);

  for (const pair of PAIRS) {
    section(pair.name);
    const input = JSON.parse(read(pair.input));
    const output = await loadModule(pair.output);
    const raw = pair.raws ? await loadModule(pair.raws) : null;
    if (raw) checkRawFixture(raw);
    checkInput(input, pair.name);
    if (raw) checkConversion(raw, input, output);
    checkOutput(output, input, pair.name);
    checkViewer(output, pair.name);
  }
  report();
}

main().catch((err) => {
  console.error('verifier crashed:', err);
  process.exitCode = 1;
});
