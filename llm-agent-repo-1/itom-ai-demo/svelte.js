/**
 * Canonical output of the `itom-topology-flow` skill.
 * Input: ./web_data.json  (ServiceNow CMDB + Azure Resource Graph)
 * Target: @xyflow/svelte
 *
 * Regenerate this file by re-running the skill against web_data.json; keep the
 * field names and presentation tokens in sync with references/rendering.md.
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

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------
export const initialNodes = [
  // -- Container: Azure resource group -------------------------------------
  {
    id: 'rg-orders-prod',
    type: 'group',
    data: {
      label: 'Orders Platform (Prod)',
      kind: 'resource_group',
      provider: 'azure',
      region: 'eastus'
    },
    position: { x: 0, y: 0 },
    style: `${GROUP_BASE} width: 680px; height: 420px;`
  },

  // -- Container: subnet nested inside the resource group -----------------
  {
    id: 'snet-workloads-01',
    type: 'group',
    parentId: 'rg-orders-prod',
    extent: 'parent',
    data: {
      label: 'snet-workloads-01',
      kind: 'subnet',
      cidr: '10.0.2.0/24',
      nsg: 'nsg-workloads'
    },
    position: { x: 30, y: 70 },
    style:
      'border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px dashed #38bdf8; width: 380px; height: 170px;'
  },

  // -- CI: application server (healthy) -----------------------------------
  {
    id: 'ci-web-01',
    type: 'server',
    parentId: 'snet-workloads-01',
    extent: 'parent',
    position: { x: 20, y: 70 },
    data: {
      label: 'web-server-01.prod',
      ciType: 'cmdb_ci_linux_server',
      status: 'healthy',
      provider: 'azure',
      ip: '10.0.2.10',
      icon: 'fa-server',
      metrics: { cpu: 34, memory: 58, latency_ms: 1.2 }
    }
  },

  // -- CI: load balancer (warning) ----------------------------------------
  {
    id: 'ci-lb-01',
    type: 'load_balancer',
    parentId: 'snet-workloads-01',
    extent: 'parent',
    position: { x: 200, y: 70 },
    data: {
      label: 'alb-orders-01',
      ciType: 'cmdb_ci_lb',
      status: 'warning',
      provider: 'azure',
      ip: '10.0.2.5',
      icon: 'fa-network-wired',
      metrics: { cpu: 61, memory: 44, latency_ms: 32.4, incidents: 2 }
    }
  },

  // -- CI: database instance (error) --------------------------------------
  {
    id: 'ci-db-01',
    type: 'database',
    parentId: 'rg-orders-prod',
    extent: 'parent',
    position: { x: 430, y: 90 },
    data: {
      label: 'pg-primary-01',
      ciType: 'cmdb_ci_db_instance',
      status: 'error',
      provider: 'azure',
      ip: '10.0.3.15',
      icon: 'fa-database',
      metrics: { cpu: 98, memory: 91, latency_ms: 145.0, incidents: 5 }
    }
  },

  // -- CI: managed cloud service (healthy) --------------------------------
  {
    id: 'ci-store-01',
    type: 'cloud_service',
    parentId: 'rg-orders-prod',
    extent: 'parent',
    position: { x: 430, y: 230 },
    data: {
      label: 'ordersblob01',
      ciType: 'cmdb_ci_cloud_service',
      status: 'healthy',
      provider: 'azure',
      resourceType: 'Microsoft.Storage/storageAccounts',
      icon: 'fa-cloud',
      metrics: { throughput_mbps: 320, latency_ms: 3.4 }
    }
  }
];

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------
export const initialEdges = [
  // Client traffic: load balancer → app server (live, animated)
  {
    id: 'e-lb-web',
    source: 'ci-lb-01',
    target: 'ci-web-01',
    type: 'smoothstep',
    animated: true,
    label: 'HTTP/8080',
    data: { category: 'traffic', traffic_rate: 'high' },
    style: edgeStyle('#38bdf8', { animated: true }),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
    ariaLabel: 'Traffic from alb-orders-01 to web-server-01.prod'
  },

  // Dependency with an active incident: app server → database (critical)
  {
    id: 'e-web-db',
    source: 'ci-web-01',
    target: 'ci-db-01',
    type: 'smoothstep',
    animated: true,
    label: 'TCP/5432',
    data: { category: 'dependency', severity: 'critical', traffic_rate: 'high' },
    style: edgeStyle('#ef4444', { animated: true }),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
    ariaLabel: 'Dependency from web-server-01.prod to pg-primary-01'
  },

  // Dependency to managed storage (steady state, static)
  {
    id: 'e-web-store',
    source: 'ci-web-01',
    target: 'ci-store-01',
    type: 'smoothstep',
    animated: false,
    label: 'HTTPS/443',
    data: { category: 'dependency' },
    style: edgeStyle('#64748b'),
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    ariaLabel: 'Dependency from web-server-01.prod to ordersblob01'
  }
];

// ---------------------------------------------------------------------------
// Custom node registry (deliver the components in references/rendering.md)
// ---------------------------------------------------------------------------
// import ServerNode from './nodes/ServerNode.svelte';
// import DatabaseNode from './nodes/DatabaseNode.svelte';
// import LoadBalancerNode from './nodes/LoadBalancerNode.svelte';
// import CloudServiceNode from './nodes/CloudServiceNode.svelte';
// import GroupNode from './nodes/GroupNode.svelte';
//
// export const nodeTypes = {
//   server: ServerNode,
//   database: DatabaseNode,
//   load_balancer: LoadBalancerNode,
//   cloud_service: CloudServiceNode,
//   group: GroupNode,
//   generic: ServerNode
// };
