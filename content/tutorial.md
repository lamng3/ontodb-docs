---
title: Tutorial
slug: tutorial
part: Getting started
order: 3
kicker: Getting started
description: A first session: create a persistent database, load an OWL ontology, query it, update it, checkpoint, verify, and reopen.
lede: This session creates a database, loads a small materials ontology, changes it, and shows that the change survives a restart.
---

## Create a database and load an ontology

Start the shell with a directory. OntoDB creates it if it does not exist.

```text
$ ./build/dev/ontodb mydb
opened mydb: no snapshot; wal 0 records, 0 committed, 0 uncommitted dropped; 0 triples
OntoDB> \load data/tiny.owl
loaded 14 triples in 5.2 ms
```

`data/tiny.owl` is an OWL ontology in RDF/XML with four classes: Material, Metal, Alloy, and Polymer. The load is one transaction. When the line `loaded 14 triples` appears, those triples are on disk.

## Query

A query may span lines. It runs when its braces close.

```text
OntoDB> PREFIX m: <http://example.org/materials#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?kind WHERE {
  ?kind rdfs:subClassOf m:Material .
}
?kind
<http://example.org/materials#Metal>
<http://example.org/materials#Polymer>
(2 rows)
```

Alloy is not listed: it is a subclass of Metal, and OntoDB stores `subClassOf` as data, not as a rule to reason with.

## Update

```text
OntoDB> INSERT DATA { <http://example.org/materials#Ceramic> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://example.org/materials#Material> . }
inserted 1 triple
OntoDB> \log 3
lsn 35 txn 2 term 18 <http://example.org/materials#Ceramic>
lsn 36 txn 2 update insert (18 9 4)
lsn 37 txn 2 commit
OntoDB> \quit
```

`\log` shows the transaction the insert wrote: a dictionary entry for the new IRI, the triple as three ids, and the commit.

## Reopen

```text
$ ./build/dev/ontodb mydb
opened mydb: no snapshot; wal 37 records, 2 committed, 0 uncommitted dropped; 15 triples
OntoDB> SELECT ?kind WHERE { ?kind <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://example.org/materials#Material> . }
?kind
<http://example.org/materials#Metal>
<http://example.org/materials#Polymer>
<http://example.org/materials#Ceramic>
(3 rows)
```

The open replayed the two committed transactions, the load and the insert.

## Checkpoint and verify

```text
OntoDB> \checkpoint
checkpoint at lsn 37: 18 terms, 15 triples; wal reset
OntoDB> \verify
snapshot: ok (lsn 37, 18 terms, 15 triples)
wal: ok (0 records, 0 bytes)
replay: matches the live database (15 triples)
invariants: ok (no duplicate triples, every id in the dictionary)
verify: ok
```

The checkpoint wrote a snapshot and emptied the log, so the next open loads the snapshot instead of replaying every record. `\verify` read both files back, rebuilt the database from them, and found it identical to the one in memory.

## Next

- [Shell reference](shell.html) for every command.
- [SPARQL reference](sparql.html) for what queries can say.
- [Persistent databases](persistence.html) for what happens on a crash.
