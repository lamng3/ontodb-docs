---
title: Overview
slug: index
order: 1
kicker: Study notes
description: OntoDB is a database management system for ontologies. These notes cover SPARQL, the B+ tree, the optimizer, the write-ahead log, and ARIES.
lede: OntoDB is a database management system for ontologies. Data is RDF. The query language is SPARQL. These notes are the map of each feature, and of how a later comparison becomes a writeup.
---

A query is a pipeline. A committed insert is that same pipeline plus a log. The memory path already answers a SPARQL subset, and `ontodb <dir>` keeps it on disk with a snapshot and a write-ahead log. The index, the optimizer, and page-level recovery are specified and still to build.

## The pieces

<div class="cards">
<a class="card" href="sparql.html"><strong>SPARQL</strong><span>The language the shell accepts, and the errors it returns on purpose.</span></a>
<a class="card" href="query-engine.html"><strong>Query engine</strong><span>Binder, left-deep plans, and volcano executors over term ids.</span></a>
<a class="card" href="optimizer.html"><strong>Optimizer</strong><span>Statistics, cardinality, join order, and join method. This will exist.</span></a>
<a class="card" href="dictionary.html"><strong>Dictionary</strong><span>IRIs, literals, and blanks interned to 64-bit ids.</span></a>
<a class="card" href="indexes.html"><strong>Triple indexes</strong><span>A 24-byte key and the SPO, POS, and OSP permutations.</span></a>
<a class="card" href="b-plus-tree.html"><strong>B+ tree</strong><span>The index. Leaves hold keys. Parents hold separators.</span></a>
<a class="card" href="buffer-pool.html"><strong>Buffer pool</strong><span>4 KiB pages, LRU-K, guards, and a pageLSN on every page.</span></a>
<a class="card" href="concurrency.html"><strong>Concurrency</strong><span>Strict 2PL, intention locks, isolation, deadlocks, phantoms.</span></a>
<a class="card" href="recovery.html"><strong>WAL and ARIES</strong><span>Steal/no-force, group commit, analysis, redo, undo.</span></a>
<a class="card" href="durability.html"><strong>Persistence and snapshots</strong><span>The durable memory database today, page files later, in-place deletes, and what a scan freezes.</span></a>
<a class="card" href="shell.html"><strong>Shell and checks</strong><span>How to load a file, run a query, and check a feature.</span></a>
<a class="card" href="research.html"><strong>Benchmarks and writeups</strong><span>One engine, a result table per question, and the writeup that cites it.</span></a>
</div>

## Two paths

A read of `data/tiny.ttl` stays in memory:

1. The shell collects a query until braces and quotes balance.
2. The lexer and parser build an AST. `a` means `rdf:type`.
3. The binder resolves prefixes and interns constants.
4. The planner builds a left-deep tree of triple scans, nested-loop joins, a filter, and a projection.
5. Volcano `Init` / `Next` pulls rows of term ids from `MemStore`.
6. The shell prints spellings looked up in `MemDictionary`.

An insert into a durable memory database, which runs today:

1. The binder interns the new spellings in `MemDictionary`.
2. The statement runs against a `RecordingStore`, which remembers each triple it changed.
3. The log gets begin, one term record per spelling not logged yet, one update per changed triple, and commit. Every record carries a CRC-32C.
4. The commit is forced before the prompt returns. If the statement throws, its changes are undone in memory and nothing it needs is logged.
5. On the next `ontodb <dir>`, the snapshot loads and the committed transactions after it replay.

An insert, once the disk features exist, does not stop at the memory store:

1. The dictionary turns three spellings into ids. The bytes live in a term heap.
2. Those ids are packed into a 24-byte big-endian `TripleKey`.
3. The indexed store inserts that key into each permutation the catalog has a root for.
4. The B+ tree pins pages through guards. Frames live in the buffer pool. Eviction is LRU-K.
5. Before a dirty page is written, the log is flushed through that page's pageLSN. That is the WAL rule.
6. Commit forces a commit record. On the next open, ARIES runs analysis, redo, and undo.

::: today
The memory query path runs. `ontodb <dir>` opens a durable memory database: updates and `\load` are logged transactions, `\checkpoint` writes a snapshot, and `\verify` rebuilds from the files and compares. Without a directory the shell keeps nothing. `scripts/status` shows 9 of 53 slices: the log records (8.1), the log manager (8.2), and the durable memory database (9.1 to 9.7).
:::

::: next
The first implementation item is [TripleKey](indexes.html#the-24-byte-key), plan 0.2. The full order is [What to build next](next.html).
:::

## What already runs

- Turtle, N-Triples, and RDF/XML through raptor2. OWL is stored as RDF. There is no reasoner.
- `PREFIX`, `SELECT` (variables or `*`), basic graph patterns with `a`, `;`, and `,`, and `FILTER` with `= != < > <= >=` and `&&`.
- `DISTINCT`, `LIMIT`, `OFFSET`, and `ORDER BY` are parsed and placed in the plan. Their executors are not built yet, so executing them throws.
- `INSERT DATA` and `DELETE DATA`, each one transaction when the database has a directory.
- A durable memory database: a checksummed write-ahead log with group commit, snapshots, two recovery modes for a torn or corrupt log, and `\verify`. See [Persistence and snapshots](durability.html#the-durable-memory-database).
- `\explain` prints the plan and does not execute. `\explain analyze` is plan 5.5.

`OPTIONAL`, `UNION`, property paths, aggregates, and `DELETE/INSERT WHERE` fail with a line and a column. That is a finished error, not a crash.

## What this site is for

Read a feature before you build it. Each page says what the piece is, how OntoDB uses it, what works today, and the slice that comes next. [Benchmarks and writeups](research.html) is how a finished comparison is recorded. The code repository stays separate. `PLAN.md` there is the feature list.
