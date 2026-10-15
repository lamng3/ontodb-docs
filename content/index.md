---
title: Introduction
slug: index
part: Getting started
order: 1
kicker: OntoDB Manual
description: The OntoDB manual. OntoDB is a database management system for ontologies; data is RDF and the query language is SPARQL.
lede: OntoDB is a database management system for ontologies. Data is RDF, the query language is SPARQL, and a database can live in a directory with a write-ahead log and snapshots.
---

This manual describes how to install OntoDB, load ontologies, query and update them, keep a database on disk, and recover it after a crash. The last parts describe how OntoDB works inside and how the project is developed.

## What OntoDB does today

- Loads Turtle, N-Triples, and RDF/XML. OWL files load as RDF triples; there is no reasoner.
- Answers SPARQL `SELECT` queries over a basic graph pattern with `FILTER`, and runs `INSERT DATA` and `DELETE DATA`. See [SPARQL reference](sparql.html).
- Keeps a database on disk when started with a directory: every update is a transaction, a checksummed write-ahead log records it, `\checkpoint` writes a snapshot, and reopening the directory restores every committed transaction. See [Persistent databases](persistence.html).
- Checks itself: `\verify` rebuilds the database from its files and compares it with the live one.

Indexes, the cost-based optimizer, concurrent transactions, and the page-based disk store are designed and being built. See [Roadmap](next.html).

## Quick start

```text
cmake --preset dev && cmake --build --preset dev
./build/dev/ontodb mydb
```

```text
OntoDB> \load data/tiny.owl
loaded 14 triples in 5.2 ms
OntoDB> SELECT ?kind WHERE { ?kind <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://example.org/materials#Material> . }
?kind
<http://example.org/materials#Metal>
<http://example.org/materials#Polymer>
(2 rows)
```

[Installation](install.html) has the prerequisites, and the [Tutorial](tutorial.html) walks through a full session.

## How this manual is organized

<div class="cards">
<a class="card" href="install.html"><strong>Getting started</strong><span>Install, build, and a first session from load to recovery.</span></a>
<a class="card" href="shell.html"><strong>Using OntoDB</strong><span>The shell, SPARQL, loading data, persistent databases, and settings.</span></a>
<a class="card" href="formats.html"><strong>Reference</strong><span>On-disk file formats, messages, and troubleshooting.</span></a>
<a class="card" href="query-engine.html"><strong>Internals</strong><span>Query engine, dictionary, indexes, B+ tree, buffer pool, concurrency, and recovery.</span></a>
<a class="card" href="development.html"><strong>Project</strong><span>Building and testing, the roadmap, and how results are reported.</span></a>
</div>

## Conventions

`OntoDB>` is the shell prompt. Commands that start with `\` are shell commands; everything else is SPARQL. A **Status** box says what works today. A **Planned** box describes work that is designed but not built. Features that are not built yet answer `not built yet (PLAN x.y)`, where `x.y` is the item in the project's `PLAN.md`.
