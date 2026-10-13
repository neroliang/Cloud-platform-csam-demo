# pip3 install neo4j-driver
# python3 example.py

from neo4j import GraphDatabase, basic_auth
import os

driver = GraphDatabase.driver(
  os.environ["NEO4J_URI"],
  auth=basic_auth("neo4j", os.environ["NEO4J_PASSWORD"]))

cypher_query = '''
MATCH (n)
RETURN COUNT(n) AS count
LIMIT $limit
'''

with driver.session(database="neo4j") as session:
  # FIX: Changed read_transaction to execute_read
  results = session.execute_read(
    lambda tx: tx.run(cypher_query, limit=20).data()
  )
  for record in results:
    print(record['count'])

driver.close()
