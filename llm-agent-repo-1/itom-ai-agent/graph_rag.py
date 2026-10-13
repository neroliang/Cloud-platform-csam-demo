# pip3 install neo4j-driver
# python3 example.py
# NEO4J_URI = 
# NEO4J_USER = 
# NEO4J_PASSWORD = 
# OPENAI_MODEL = 
from neo4j import GraphDatabase, basic_auth

#!/usr/bin/env python3
"""Graph RAG over the Azure resource graph: OpenAI for language, fixed Cypher for retrieval.

The LLM never writes Cypher. It can only call `graph_neighbors` with validated
arguments; node names are resolved strictly in code.

Setup:
  pip install neo4j openai
Env (never hard-code these):
  NEO4J_URI        e.g. neo4j+s://<host>:7687  (use an encrypted scheme)
  NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE (optional, default "neo4j")
  OPENAI_API_KEY, OPENAI_MODEL  (a model that supports tool calling)
Run:
  python rag_graph.py "Which VMs are in vnet-data-tier-prod?"
  python rag_graph.py            # interactive
"""
import json
import os
import re
import sys

from neo4j import GraphDatabase, READ_ACCESS
from openai import OpenAI

# ---- Graph vocabulary (must match seed_azure.cypher) ----------------------
ALLOWED_LABELS = ["ResourceGroup", "VNet", "VirtualMachine", "KeyVault",
                  "PostgreSQL", "SqlDatabase", "ServiceBus", "PrivateEndpoint"]
ALLOWED_RELS = ["IN_RESOURCE_GROUP", "IN_VNET", "PRIVATE_LINK_TO"]
NAME_PROP = "name"
MAX_DEPTH, MAX_ROWS, MAX_TOOL_ROUNDS = 3, 50, 4
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""You answer questions about an Azure resource graph. Use ONLY the
graph_neighbors tool; never invent resources or names.

Schema:
- Node labels: {', '.join(ALLOWED_LABELS)} (all have a `name`)
- (resource)-[:IN_RESOURCE_GROUP]->(ResourceGroup)
- (resource)-[:IN_VNET]->(VNet)   (VMs, PostgreSQL, SqlDatabase, ServiceBus, PrivateEndpoint)
- (PrivateEndpoint)-[:PRIVATE_LINK_TO]->(KeyVault)
Direction: "downstream" follows arrows out of the start node (what it is in / links to).
"upstream" follows arrows into it (what is inside / attached to it).
Examples: "what is in vnet X" = upstream of X via IN_VNET.
"which vnet is VM Y in" = downstream of Y via IN_VNET.

Rules:
1. Before calling the tool, state in one line how you interpreted the question.
2. Pass node names exactly as the user wrote them. Do not guess or correct them.
3. On `no_match`, ask the user for the exact name. On `ambiguous`, list the
   candidates and ask which; then call again with node_id.
4. Default depth 1. If `truncated` is true, say the list is incomplete.
5. Answer only from tool output. If the question needs a lookup this tool
   cannot do (e.g. intersecting two conditions), say so instead of improvising."""

TOOLS = [{
    "type": "function",
    "function": {
        "name": "graph_neighbors",
        "description": "List nodes connected to a start node, following chosen "
                       "relationship types in one direction, up to a small depth.",
        "parameters": {
            "type": "object",
            "properties": {
                "node": {"type": "string", "description": "Exact resource name as the user wrote it."},
                "node_id": {"type": "string", "description": "elementId, only after an ambiguous result."},
                "direction": {"type": "string", "enum": ["downstream", "upstream"]},
                "relationships": {"type": "array", "items": {"type": "string", "enum": ALLOWED_RELS}},
                "depth": {"type": "integer", "minimum": 1, "maximum": MAX_DEPTH},
                "limit": {"type": "integer", "minimum": 1, "maximum": MAX_ROWS},
            },
            "required": ["direction"],
        },
    },
}]

driver = GraphDatabase.driver(
    os.environ["NEO4J_URI"],
    auth=(os.environ["NEO4J_USER"], os.environ["NEO4J_PASSWORD"]),
)
DB = os.environ.get("NEO4J_DATABASE", "neo4j")


def run_read(cypher, **params):
    with driver.session(database=DB, default_access_mode=READ_ACCESS) as s:
        return s.execute_read(lambda tx: tx.run(cypher, **params).data())


def norm(s):
    """Almost-strict: case-insensitive; '-', '_' and spaces are equivalent."""
    return re.sub(r"[\s_\-]+", " ", s.strip().lower())


def graph_neighbors(node=None, node_id=None, direction="downstream",
                    relationships=None, depth=1, limit=25):
    # --- validate everything the model supplied ---
    if direction not in ("downstream", "upstream"):
        return {"error": "bad_args", "detail": "direction must be downstream or upstream"}
    rels = relationships or ALLOWED_RELS
    if not all(r in ALLOWED_RELS for r in rels):
        return {"error": "bad_args", "detail": f"relationships must be in {ALLOWED_RELS}"}
    if not (isinstance(depth, int) and 1 <= depth <= MAX_DEPTH):
        return {"error": "bad_args", "detail": f"depth must be 1-{MAX_DEPTH}"}
    if not (isinstance(limit, int) and 1 <= limit <= MAX_ROWS):
        return {"error": "bad_args", "detail": f"limit must be 1-{MAX_ROWS}"}
    if not (node or node_id):
        return {"error": "bad_args", "detail": "provide node or node_id"}

    # --- strict start-node resolution (in code, not by the model) ---
    if node_id:
        rows = run_read(
            f"MATCH (n) WHERE elementId(n)=$id AND any(l IN labels(n) WHERE l IN $labels) "
            f"RETURN elementId(n) AS id, n.{NAME_PROP} AS name, labels(n) AS labels",
            id=node_id, labels=ALLOWED_LABELS)
    else:
        rows = run_read(
            f"MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels) AND n.{NAME_PROP} IS NOT NULL "
            f"AND toLower(replace(replace(trim(n.{NAME_PROP}),'_',' '),'-',' ')) = $norm "
            f"RETURN elementId(n) AS id, n.{NAME_PROP} AS name, labels(n) AS labels LIMIT 10",
            labels=ALLOWED_LABELS, norm=norm(node))
    if not rows:
        return {"error": "no_match", "searched": node or node_id}
    if len(rows) > 1:
        return {"error": "ambiguous", "candidates": rows}
    start = rows[0]

    # --- fixed traversal; rel types/depth validated above, so safe to inline ---
    rel_expr = "|".join(rels)
    pattern = (f"(s)-[:{rel_expr}*1..{depth}]->(t)" if direction == "downstream"
               else f"(s)<-[:{rel_expr}*1..{depth}]-(t)")
    res = run_read(
        f"MATCH p={pattern} WHERE elementId(s)=$id "
        f"RETURN DISTINCT elementId(t) AS id, t.{NAME_PROP} AS name, labels(t) AS labels, "
        f"min(length(p)) AS hops ORDER BY hops, name LIMIT $limit",
        id=start["id"], limit=limit)
    return {
        "interpreted_as": {"start": start, "direction": direction,
                           "relationships": rels, "depth": depth},
        "row_count": len(res),
        "truncated": len(res) == limit,
        "results": res,
    }


def ask(client, model, question):
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": question}]
    for _ in range(MAX_TOOL_ROUNDS):
        resp = client.chat.completions.create(
            model=model, messages=messages, tools=TOOLS, temperature=0)
        msg = resp.choices[0].message
        if not msg.tool_calls:
            return msg.content
        messages.append(msg)
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
                result = graph_neighbors(**args)
            except (json.JSONDecodeError, TypeError) as e:
                result = {"error": "bad_args", "detail": str(e)}
            print(f"[tool] {tc.function.name} {tc.function.arguments}", file=sys.stderr)
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(result, default=str)})
    return "Stopped: too many tool rounds without a final answer."


def main():
    client = OpenAI()  # reads OPENAI_API_KEY
    model = os.environ["OPENAI_MODEL"]
    try:
        if len(sys.argv) > 1:
            print(ask(client, model, " ".join(sys.argv[1:])))
        else:
            while (q := input("question> ").strip()):
                print(ask(client, model, q), "\n")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
