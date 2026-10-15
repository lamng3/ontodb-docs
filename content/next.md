---
title: Roadmap
slug: next
part: Project
order: 2
kicker: Project
description: What OntoDB can do now, what is being built next, and what is deliberately left open.
lede: 38 of 53 slices are done. The optimizer orders joins from exact statistics; next are the automatic choice of join and EXPLAIN ANALYZE.
---

## Done

| Feature | Check | Status |
| --- | --- | --- |
| SPARQL shell | `scripts/check shell` | Done |
| Triple key | `scripts/check key` | Done: the key round-trips and the prefix bounds match |
| Buffer pool | `scripts/check buffer` | Done: disk file, I/O thread, LRU-K, pool, guards, inspection |
| B+ tree | `scripts/check index` | Done: layout, invariants, search, insert, iterator, bulk load, delete |
| RDF storage | `scripts/check storage` | Done: term heap, disk dictionary, catalog, indexed store, SPO/POS/OSP measured, clean restart |
| Query execution | `scripts/check execution` | Done: rebinding, index nested loop, hash join, distinct, limit, external sort, insert and delete |
| Durable memory database | `scripts/check durable` | Done: all seven slices |
| Recovery | `scripts/check recovery` | Log records (8.1) and log manager (8.2) done; page-based recovery to build |

## Being built

In order. Each feature's page in Internals describes its design.

| Feature | Check | Done when |
| --- | --- | --- |
| Optimizer | `scripts/check optimizer` | A rewritten plan returns the same rows |
| Bulk load | `scripts/check load` | About 100k LUBM triples load under a small pool |
| Concurrency | `scripts/check concurrency` | The feature is green under ThreadSanitizer |
| Recovery | `scripts/check recovery` | `scripts/crashtest --seeds 200` exits 0 |

## Left open

These have no stubs. Each starts as a design written next to its code, then a benchmark, then a [writeup](research.html).

- Another eviction policy beside LRU-K.
- A different set of index permutations.
- MVCC beside strict two-phase locking.
- Leaf compression with delta-encoded keys.
- RDFS `subClassOf` materialization.
- A query window that sends the same text the shell sends.
- Page checksums on the disk store, checked on read and by `\verify`.
- Restore to a chosen LSN: replay the snapshot and the log up to an LSN and stop.

::: next
The 24-byte key: `scripts/check key`. See [Triple indexes](indexes.html#the-24-byte-key).
:::
