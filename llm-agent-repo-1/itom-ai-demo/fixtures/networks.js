/**
 * LEGACY FIXTURE - v0 flat topology export.
 *
 * The payload is byte-for-byte the data block of
 * ../azure_vnet_impact_topology.html (the original canvas demo), only lifted
 * into an ES module so a test can import it. It is kept as a regression
 * *input* for the `itom-topology-flow` skill, and it deliberately violates the
 * current input contract in these ways:
 *
 *   1. `type` holds an Azure **resource type**, not a CI class. The normalised
 *      home for it is `properties.resource_type`.
 *   2. `throughput` / `latency` are flat numbers instead of
 *      `properties.metrics.{throughput_mbps,latency_ms}`.
 *   3. `subnet` is a denormalised container name. Hierarchy is not modelled, so
 *      there is no `parent` link and no `Subnet` node to point at.
 *   4. `ip` carries prose for the two PaaS nodes ("Azure Web App (PaaS)",
 *      "PaaS Private Link Endpoint"), not an address.
 *   5. `vector`, `x`, `y`, `isExternal` and `attachedTo` are demo-only fields
 *      with no equivalent in schemas/itom-graph.schema.json.
 *   6. `nic-vm-01.attachedTo` -> `vm-orders-backend-01`, which is absent from
 *      the export: a dangling reference.
 *   7. Edge `type` is a colour token (`fuchsia` / `sky`) and `category` uses
 *      `outbound` / `internal` / `privatelink`, none of which are values in the
 *      `category` enum (`dependency|traffic|impact|secure|replication`).
 *
 * The schema-valid conversion and the skill output live alongside it:
 *
 *   ./networks.normalised.json   input contract  (graph_nodes / graph_relationships)
 *   ./networks.svelte.js         output contract (initialNodes / initialEdges)
 *   ./README.md                  raw -> normalised -> output mapping table
 *
 * Verify the whole chain with:  node fixtures/verify.mjs
 */
export const azureTopologyData = {
      nodes: [
        // Outbound App Service Source
        {
          id: 'app-service-01',
          name: 'app-orders-api',
          ip: 'Azure Web App (PaaS)',
          type: 'Microsoft.Web/sites',
          vector: 'outbound',
          icon: 'fa-cloud-arrow-up',
          status: 'healthy',
          throughput: 210,
          latency: 2.1,
          x: 20,
          y: 130,
          subnet: 'External PaaS',
          details: 'Outbound regional VNet integration enabled.'
        },
        // Delegated Subnet Integration Interface
        {
          id: 'vnet-int-interface',
          name: 'vnet-integration-endpoint',
          ip: '10.0.1.8',
          type: 'Microsoft.Web/serverFarms/delegation',
          vector: 'outbound',
          icon: 'fa-right-to-bracket',
          status: 'healthy',
          throughput: 210,
          latency: 0.8,
          x: 340,
          y: 140,
          subnet: 'snet-integration-01',
          details: 'Subnet delegated to App Service farm for outbound traffic injection.'
        },
        // Internal Workload VM NIC
        {
          id: 'nic-vm-01',
          name: 'nic-orders-vm01',
          ip: '10.0.2.10',
          type: 'Microsoft.Network/networkInterfaces',
          vector: 'internal',
          icon: 'fa-ethernet',
          status: 'healthy',
          throughput: 85,
          latency: 1.2,
          x: 520,
          y: 295,
          subnet: 'snet-workloads-01',
          attachedTo: 'vm-orders-backend-01'
        },
        // Private Endpoint Node inside Subnet
        {
          id: 'pe-sql-01',
          name: 'pe-sqldb-primary',
          ip: '10.0.3.15',
          type: 'Microsoft.Network/privateEndpoints',
          vector: 'privatelink',
          icon: 'fa-shield-halved',
          status: 'healthy',
          throughput: 320,
          latency: 1.5,
          x: 520,
          y: 460,
          subnet: 'snet-private-endpoints-01',
          fqdn: 'sqldb-orders-prod.privatelink.database.windows.net'
        },
        // Target External Azure SQL DB
        {
          id: 'sqldb-external',
          name: 'sqldb-orders-prod (Azure SQL)',
          ip: 'PaaS Private Link Endpoint',
          type: 'Microsoft.Sql/servers/databases',
          vector: 'privatelink',
          icon: 'fa-database',
          status: 'healthy',
          throughput: 320,
          latency: 1.9,
          x: 1020,
          y: 460,
          isExternal: true,
          subnet: 'External PaaS'
        }
      ],
      edges: [
        // App Service Outbound to Delegated Subnet
        { id: 'e-app-delegation', source: 'app-service-01', target: 'vnet-int-interface', label: 'Outbound Swift Connection', type: 'fuchsia', category: 'outbound' },
        
        // VNet Integration routing internally to VM NIC
        { id: 'e-int-vm', source: 'vnet-int-interface', target: 'nic-vm-01', label: 'HTTP / Port 8080', type: 'fuchsia', category: 'outbound' },
        
        // VNet Integration routing to Private Endpoint (Outbound PaaS access)
        { id: 'e-int-pe', source: 'vnet-int-interface', target: 'pe-sql-01', label: 'SQL / Port 1433', type: 'fuchsia', category: 'outbound' },

        // Internal VM NIC accessing Private Endpoint
        { id: 'e-vm-pe', source: 'nic-vm-01', target: 'pe-sql-01', label: 'Port 1433', type: 'sky', category: 'internal' },
        
        // Private Endpoint to External PaaS Service
        { id: 'e-pe-sqldb', source: 'pe-sql-01', target: 'sqldb-external', label: 'Private Link Tunnel', type: 'sky', category: 'privatelink' }
      ]
    };