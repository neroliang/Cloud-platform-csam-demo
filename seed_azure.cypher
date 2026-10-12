// Azure test dataset for the neo4j-graph skill.
// TEST INSTANCE ONLY. Wipe first if needed:
// MATCH (n) DETACH DELETE n;

// --- Resource groups ---
CREATE (:ResourceGroup {name: 'rg-storefront-prod'});
CREATE (:ResourceGroup {name: 'rg-dataservices-prod'});
CREATE (:ResourceGroup {name: 'rg-integration-prod'});

// --- VNets ---
CREATE (:VNet {name: 'vnet-app-tier-prod'});
CREATE (:VNet {name: 'vnet-shared-services-prod'});
CREATE (:VNet {name: 'vnet-data-tier-prod'});
CREATE (:VNet {name: 'vnet-management-prod'});

// --- 20 virtual machines ---
UNWIND [
  {n:'vm-web-01',         rg:'rg-storefront-prod',   vn:'vnet-app-tier-prod',        role:'web'},
  {n:'vm-web-02',         rg:'rg-storefront-prod',   vn:'vnet-app-tier-prod',        role:'web'},
  {n:'vm-web-03',         rg:'rg-storefront-prod',   vn:'vnet-app-tier-prod',        role:'web'},
  {n:'vm-cache-01',       rg:'rg-storefront-prod',   vn:'vnet-app-tier-prod',        role:'cache'},
  {n:'vm-api-01',         rg:'rg-storefront-prod',   vn:'vnet-shared-services-prod', role:'api'},
  {n:'vm-api-02',         rg:'rg-storefront-prod',   vn:'vnet-shared-services-prod', role:'api'},
  {n:'vm-batch-01',       rg:'rg-storefront-prod',   vn:'vnet-data-tier-prod',       role:'batch'},
  {n:'vm-batch-02',       rg:'rg-storefront-prod',   vn:'vnet-data-tier-prod',       role:'batch'},
  {n:'vm-etl-01',         rg:'rg-dataservices-prod', vn:'vnet-data-tier-prod',       role:'etl'},
  {n:'vm-etl-02',         rg:'rg-dataservices-prod', vn:'vnet-data-tier-prod',       role:'etl'},
  {n:'vm-reporting-01',   rg:'rg-dataservices-prod', vn:'vnet-data-tier-prod',       role:'reporting'},
  {n:'vm-vault-agent-01', rg:'rg-dataservices-prod', vn:'vnet-shared-services-prod', role:'secrets-agent'},
  {n:'vm-dbadmin-01',     rg:'rg-dataservices-prod', vn:'vnet-management-prod',      role:'admin'},
  {n:'vm-bastion-01',     rg:'rg-dataservices-prod', vn:'vnet-management-prod',      role:'bastion'},
  {n:'vm-msgworker-01',   rg:'rg-integration-prod',  vn:'vnet-shared-services-prod', role:'worker'},
  {n:'vm-msgworker-02',   rg:'rg-integration-prod',  vn:'vnet-shared-services-prod', role:'worker'},
  {n:'vm-msgworker-03',   rg:'rg-integration-prod',  vn:'vnet-shared-services-prod', role:'worker'},
  {n:'vm-scheduler-01',   rg:'rg-integration-prod',  vn:'vnet-app-tier-prod',        role:'scheduler'},
  {n:'vm-monitor-01',     rg:'rg-integration-prod',  vn:'vnet-management-prod',      role:'monitoring'},
  {n:'vm-jump-01',        rg:'rg-integration-prod',  vn:'vnet-management-prod',      role:'jumpbox'}
] AS v
MATCH (rg:ResourceGroup {name: v.rg}), (vn:VNet {name: v.vn})
CREATE (vm:VirtualMachine {name: v.n, role: v.role})
CREATE (vm)-[:IN_RESOURCE_GROUP]->(rg)
CREATE (vm)-[:IN_VNET]->(vn);

// --- Key Vaults (reached via private endpoints) ---
MATCH (rga:ResourceGroup {name:'rg-storefront-prod'}),
      (rgb:ResourceGroup {name:'rg-dataservices-prod'}),
      (app:VNet {name:'vnet-app-tier-prod'}),
      (shr:VNet {name:'vnet-shared-services-prod'})
CREATE (kva:KeyVault {name:'kv-storefront-secrets-prod'})
CREATE (kvb:KeyVault {name:'kv-dataservices-keys-prod'})
CREATE (kva)-[:IN_RESOURCE_GROUP]->(rga)
CREATE (kvb)-[:IN_RESOURCE_GROUP]->(rgb)
CREATE (pea:PrivateEndpoint {name:'pe-kv-storefront-secrets-prod'})
CREATE (peb:PrivateEndpoint {name:'pe-kv-dataservices-keys-prod'})
CREATE (pea)-[:IN_VNET]->(app)
CREATE (peb)-[:IN_VNET]->(shr)
CREATE (pea)-[:PRIVATE_LINK_TO]->(kva)
CREATE (peb)-[:PRIVATE_LINK_TO]->(kvb);

// --- PostgreSQL (ra, in app-tier) ---
MATCH (rg:ResourceGroup {name:'rg-storefront-prod'}), (vn:VNet {name:'vnet-app-tier-prod'})
CREATE (pg:PostgreSQL {name:'psql-storefront-orders-prod'})
CREATE (pg)-[:IN_RESOURCE_GROUP]->(rg)
CREATE (pg)-[:IN_VNET]->(vn);

// --- SQL database (rb, in data-tier) ---
MATCH (rg:ResourceGroup {name:'rg-dataservices-prod'}), (vn:VNet {name:'vnet-data-tier-prod'})
CREATE (sq:SqlDatabase {name:'sqldb-analytics-warehouse-prod'})
CREATE (sq)-[:IN_RESOURCE_GROUP]->(rg)
CREATE (sq)-[:IN_VNET]->(vn);

// --- Service Bus (rc, in shared-services) ---
MATCH (rg:ResourceGroup {name:'rg-integration-prod'}), (vn:VNet {name:'vnet-shared-services-prod'})
CREATE (sb:ServiceBus {name:'sb-order-events-prod'})
CREATE (sb)-[:IN_RESOURCE_GROUP]->(rg)
CREATE (sb)-[:IN_VNET]->(vn);
