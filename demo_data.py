#!/usr/bin/env python3
"""Run SPARQL on the real OntoDB shell and export each query's result and plan for the manual's live demo.

    ONTODB=/path/to/ontodb python3 demo_data.py [../ontodb/data/pizza.ttl]

Each query is run twice in a fresh in-memory database: once for its rows, once under `\\explain analyze` for the
plan with estimated and actual row counts. The page only displays what the shell printed.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "ontodb" / "data" / "pizza.ttl").resolve()
BINARY = os.environ.get("ONTODB", "ontodb")
PREFIX = (
    "PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#> "
    "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> "
    "PREFIX owl: <http://www.w3.org/2002/07/owl#> "
)
QUERIES = [
    ("Named pizzas", "Which classes are kinds of NamedPizza?",
     "SELECT ?pizza ?label WHERE { ?pizza rdfs:subClassOf pizza:NamedPizza . ?pizza rdfs:label ?label }"),
    ("Toppings of a pizza", "What goes on a Margherita?",
     "SELECT ?topping WHERE { pizza:MargheritaPizza pizza:hasTopping ?topping }"),
    ("A join", "Which named pizzas have a topping, and which?",
     "SELECT ?pizza ?topping WHERE { ?pizza rdfs:subClassOf pizza:NamedPizza . ?pizza pizza:hasTopping ?topping }"),
    ("A path through the hierarchy", "Which classes sit two steps below Pizza?",
     "SELECT ?c WHERE { ?c rdfs:subClassOf ?mid . ?mid rdfs:subClassOf pizza:Pizza }"),
]


def shell(*lines):
    script = "\n".join([f"\\load {DATA}", *lines, "\\quit"]) + "\n"
    out = subprocess.run([BINARY], input=script, capture_output=True, text=True, check=True).stdout
    return [part.strip() for part in out.split("OntoDB> ")][1:]  # one block per input line, the prompt removed


def main():
    triples = shell()[0]
    out = {"data": DATA.name, "loaded": triples.split(" in ")[0], "queries": []}
    for title, question, body in QUERIES:
        sparql = PREFIX + body
        rows, = shell(sparql)[1:2]
        plan, = shell(f"\\explain analyze {sparql}")[1:2]
        out["queries"].append({"title": title, "question": question, "sparql": body, "rows": rows, "plan": plan})
    (ROOT / "demo-data.json").write_text(json.dumps(out, indent=1))
    print(f"{len(out['queries'])} queries, {out['loaded']}")


if __name__ == "__main__":
    main()
