// Test data for the neo4j-graph skill. Run in Neo4j Browser or:
//   cypher-shell -u neo4j -p <pw> -f seed.cypher
// Wipe test data first (TEST INSTANCE ONLY):
// MATCH (n) DETACH DELETE n;

CREATE (web:Service      {name: 'web-frontend'})
CREATE (gw:Service       {name: 'api-gateway'})
CREATE (pay:Service      {name: 'payments-api'})
CREATE (ord:Service      {name: 'orders-api'})
CREATE (auth:Service     {name: 'auth-service'})
CREATE (notif:Service    {name: 'notification-service'})
CREATE (paydb:Database   {name: 'payments-db-prod'})
CREATE (orddb:Database   {name: 'orders-db-prod'})
CREATE (authdb:Database  {name: 'auth-db-prod'})
CREATE (plat:Team        {name: 'platform-team'})
CREATE (comm:Team        {name: 'commerce-team'})

// Deliberate ambiguity test: normalises to the same name as 'payments-api'
CREATE (dup:Service      {name: 'Payments API'})

CREATE (web)-[:CONNECTS_TO]->(gw)
CREATE (gw)-[:DEPENDS_ON]->(auth)
CREATE (gw)-[:DEPENDS_ON]->(ord)
CREATE (gw)-[:DEPENDS_ON]->(pay)
CREATE (ord)-[:DEPENDS_ON]->(orddb)
CREATE (ord)-[:DEPENDS_ON]->(pay)
CREATE (pay)-[:DEPENDS_ON]->(paydb)
CREATE (pay)-[:DEPENDS_ON]->(notif)
CREATE (auth)-[:DEPENDS_ON]->(authdb)

CREATE (gw)-[:OWNED_BY]->(plat)
CREATE (auth)-[:OWNED_BY]->(plat)
CREATE (pay)-[:OWNED_BY]->(comm)
CREATE (ord)-[:OWNED_BY]->(comm)
CREATE (notif)-[:OWNED_BY]->(plat);
