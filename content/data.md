---
title: Loading data
slug: data
part: Using OntoDB
order: 3
kicker: Using OntoDB
description: File formats OntoDB loads, how OWL is stored, the sample data, and how to fetch larger data sets.
lede: \load reads one RDF file into the database. The format comes from the file extension.
---

## Formats

| Extension | Format |
| --- | --- |
| `.ttl` | Turtle |
| `.nt` | N-Triples |
| `.rdf`, `.owl` | RDF/XML |

Parsing is done by raptor2. The load reports how many statements the file contains, including any already stored; a triple is stored once.

```text
OntoDB> \load data/pizza.ttl
loaded 27 triples in 1.1 ms
```

## OWL

An OWL ontology is stored as the RDF triples of its serialization: classes are `rdf:type owl:Class` triples, the hierarchy is `rdfs:subClassOf` triples, and restrictions are their blank-node structures. OntoDB does not reason, so nothing is inferred at load time.

## Persistent databases

In a database opened with a directory, one `\load` is one transaction. Either every new triple of the file is committed, or, if the load fails, none is. The terms in the file are written to the log once, so ids stay the same after a restart.

## Sample data

| File | Contents |
| --- | --- |
| `data/tiny.ttl` | A small university graph, 53 triples. The query `?s a ub:Student ; ub:name ?name` returns Alice, Bob, and Cara |
| `data/tiny.owl` | A small materials ontology in RDF/XML, 14 triples |
| `data/pizza.ttl` | A small pizza ontology subset, 27 triples |
| `data/lubm/queries/` | The 14 LUBM queries, with query 7 repaired so it parses |

## Larger data sets

```text
scripts/fetch-data pizza     # the full Pizza ontology into data/downloads/
scripts/fetch-data lubm      # runs the LUBM generator (needs Java) for University0_0.owl
```

`data/downloads/` is not committed.

::: today
The in-memory store compares every stored triple on insert, so loading a large file is slow. That is the in-memory store, not the format; the indexed store (`\set backend indexed`) and its bulk loader (PLAN 6.1) are what make large graphs fast.
:::
