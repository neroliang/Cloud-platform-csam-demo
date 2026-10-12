/**
 * Output of the `itom-topology-flow` skill for the legacy Azure fixture.
 * Input:  ./networks.normalised.json  (converted from ./networks.js)
 * Target: @xyflow/svelte - same field names and tokens as ../svelte.js.
 *
 * Conversion notes (full table in ./README.md):
 *  - Three `Subnet` groups were derived from the legacy `subnet` values. The
 *    `'External PaaS'` sentinel did *not* become a container, so
 *    `app-service-01` and `sqldb-external` stay top-level - matching the demo,
 *    which drew both PaaS targets outside every VNet box.
 *  - The export only ever carried an Azure resource type, so `data.ciType`
 *    falls back to it (references/ci-type-mapping.md step 3) and
 *    `data.resourceType` repeats it verbatim.
 *  - Legacy edge colours (`fuchsia` / `sky`) and categories (`outbound` /
 *    `internal` / `privatelink`) were replaced by the canonical categories and
 *    the palette in references/rendering.md.
 *  - `nic-vm-01`'s dangling `attachedTo` reference became a `details` note; no
 *    edge is emitted to a node that does not exist.
 */
import { MarkerType } from '@xyflow/svelte';

// ---------------------------------------------------------------------------
// Presentation tokens (see references/rendering.md)
// ---------------------------------------------------------------------------
export const STATUS_TOKENS = {
  healthy: { accent: '#10b981', label: 'Healthy' },
  warning: { accent: '#f59e0b', label: 'Warning' },
  error: { accent: '#ef4444', label: 'Error' }
};

const edgeStyle = (color, { animated = false } = {}) =>
  animated
    ? `stroke: ${color}; stroke-width: 2px; stroke-dasharray: 5, 5;`
    : `stroke: ${color}; stroke-width: 2px;`;

const GROUP_BASE =
  'border-radius: 12px; background: rgba(30, 41, 59, 0.4); border: 1px dashed #3b82f6;';
const SUBNET_BASE =
  'border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px dashed #38bdf8;';

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------
export const initialNodes = [
  // -- Containers: top-level subnets (the legacy export had no resource group)
  {
    id: 'snet-integration-01',
    type: 'group',
    data: {
      label: 'snet-integration-01',
      kind: 'subnet',
      provider: 'azure'
    },
    position: { x: 240, y: 60 },
    style: `${SUBNET_BASE} width: 220px; height: 170px;`
  },
  {
    id: 'snet-workloads-01',
    type: 'group',
    data: {
      label: 'snet-workloads-01',
      kind: 'subnet',
      provider: 'azure'
    },
    position: { x: 520, y: 30 },
    style: `${SUBNET_BASE} width: 220px; height: 170px;`
  },
  {
    id: 'snet-private-endpoints-01',
    type: 'group',
    data: {
      label: 'snet-private-endpoints-01',
      kind: 'subnet',
      provider: 'azure'
    },
    position: { x: 520, y: 250 },
    style: `${SUBNET_BASE} width: 220px; height: 170px;`
  },

  // -- CI: App Service, the out-of-VNet traffic source ---------------------
  {
    id: 'app-service-01',
    type: 'server',
    position: { x: 20, y: 130 },
    data: {
      label: 'app-orders-api',
      ciType: 'Microsoft.Web/sites',
      resourceType: 'Microsoft.Web/sites',
      status: 'healthy',
      provider: 'azure',
      icon: 'fa-cloud-arrow-up',
      details: 'Outbound regional VNet integration enabled.',
      metrics: { throughput_mbps: 210, latency_ms: 2.1 }
    }
  },

  // -- CI: delegated-subnet integration interface --------------------------
  {
    id: 'vnet-int-interface',
    type: 'server',
    parentId: 'snet-integration-01',
    extent: 'parent',
    position: { x: 20, y: 70 },
    data: {
      label: 'vnet-integration-endpoint',
      ciType: 'Microsoft.Web/serverFarms/delegation',
      resourceType: 'Microsoft.Web/serverFarms/delegation',
      status: 'healthy',
      provider: 'azure',
      ip: '10.0.1.8',
      icon: 'fa-right-to-bracket',
      details: 'Subnet delegated to App Service farm for outbound traffic injection.',
      metrics: { throughput_mbps: 210, latency_ms: 0.8 }
    }
  },

  // -- CI: workload VM network interface -----------------------------------
  {
    id: 'nic-vm-01',
    type: 'generic',
    parentId: 'snet-workloads-01',
    extent: 'parent',
    position: { x: 20, y: 70 },
    data: {
      label: 'nic-orders-vm01',
      ciType: 'Microsoft.Network/networkInterfaces',
      resourceType: 'Microsoft.Network/networkInterfaces',
      status: 'healthy',
      provider: 'azure',
      ip: '10.0.2.10',
      icon: 'fa-ethernet',
      details: 'Attachment vm-orders-backend-01 is absent from this export, so no host relationship is emitted.',
      metrics: { throughput_mbps: 85, latency_ms: 1.2 }
    }
  },

  // -- CI: private endpoint for the Azure SQL database ---------------------
  {
    id: 'pe-sql-01',
    type: 'cloud_service',
    parentId: 'snet-private-endpoints-01',
    extent: 'parent',
    position: { x: 20, y: 70 },
    data: {
      label: 'pe-sqldb-primary',
      ciType: 'Microsoft.Network/privateEndpoints',
      resourceType: 'Microsoft.Network/privateEndpoints',
      status: 'healthy',
      provider: 'azure',
      ip: '10.0.3.15',
      fqdn: 'sqldb-orders-prod.privatelink.database.windows.net',
      icon: 'fa-shield-halved',
      metrics: { throughput_mbps: 320, latency_ms: 1.5 }
    }
  },

  // -- CI: out-of-VNet Azure SQL database (no parent by design) ------------
  {
    id: 'sqldb-external',
    type: 'database',
    position: { x: 820, y: 320 },
    data: {
      label: 'sqldb-orders-prod (Azure SQL)',
      ciType: 'Microsoft.Sql/servers/databases',
      resourceType: 'Microsoft.Sql/servers/databases',
      status: 'healthy',
      provider: 'azure',
      icon: 'fa-database',
      details: 'Reached over Private Link from pe-sqldb-primary; the legacy export flagged it as external (sentinel subnet "External PaaS").',
      metrics: { throughput_mbps: 320, latency_ms: 1.9 }
    }
  }
];

// ---------------------------------------------------------------------------
// Edges (legacy ids kept verbatim so the fixture stays traceable)
// ---------------------------------------------------------------------------
export const initialEdges = [
  // App Service outbound injection into the delegated subnet
  {
    id: 'e-app-delegation',
    source: 'app-service-01',
    target: 'vnet-int-interface',
    type: 'smoothstep',
    animated: true,
    label: 'Outbound Swift Connection',
    data: { category: 'traffic', traffic_rate: 'high' },
    style: edgeStyle('#38bdf8', { animated: true }),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
    ariaLabel: 'Traffic from app-orders-api to vnet-integration-endpoint'
  },

  // VNet integration routing internally to the workload NIC
  {
    id: 'e-int-vm',
    source: 'vnet-int-interface',
    target: 'nic-vm-01',
    type: 'smoothstep',
    animated: true,
    label: 'HTTP/8080',
    data: { category: 'traffic', traffic_rate: 'high' },
    style: edgeStyle('#38bdf8', { animated: true }),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
    ariaLabel: 'Traffic from vnet-integration-endpoint to nic-orders-vm01'
  },

  // VNet integration routing to the private endpoint (outbound PaaS access)
  {
    id: 'e-int-pe',
    source: 'vnet-int-interface',
    target: 'pe-sql-01',
    type: 'smoothstep',
    animated: true,
    label: 'TCP/1433',
    data: { category: 'traffic', traffic_rate: 'medium' },
    style: edgeStyle('#38bdf8', { animated: true }),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
    ariaLabel: 'Traffic from vnet-integration-endpoint to pe-sqldb-primary'
  },

  // Workload NIC data access through the private endpoint
  {
    id: 'e-vm-pe',
    source: 'nic-vm-01',
    target: 'pe-sql-01',
    type: 'smoothstep',
    animated: true,
    label: 'TCP/1433',
    data: { category: 'dependency', traffic_rate: 'medium' },
    style: edgeStyle('#64748b', { animated: true }),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    ariaLabel: 'Dependency from nic-orders-vm01 to pe-sqldb-primary'
  },

  // Private Link tunnel to the out-of-VNet database (steady state, static)
  {
    id: 'e-pe-sqldb',
    source: 'pe-sql-01',
    target: 'sqldb-external',
    type: 'smoothstep',
    animated: false,
    label: 'Private Link Tunnel',
    data: { category: 'secure' },
    style: edgeStyle('#10b981'),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
    ariaLabel: 'Secure tunnelling from pe-sqldb-primary to sqldb-orders-prod (Azure SQL)'
  }
];
