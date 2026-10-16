---
title: Roadmap
slug: next
part: Project
order: 2
kicker: Project
description: What OntoDB can do now, what is being built next, and what is deliberately left open.
lede: All 53 slices are done, page-level recovery included. Next: the page store behind ontodb <dir>, log housekeeping, more of SPARQL, and RDFS inference.
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
| Optimizer | `scripts/check optimizer` | Done: exact statistics, System R join estimates, greedy order, auto join choice, explain analyze |
| Bulk load | `scripts/check load` | Done: batch load, packed trees, LUBM(1) on a 32-frame pool |
| Concurrency | `scripts/check concurrency` | Done: crabbing, transactions, locks, isolation, deadlocks, phantoms |
| Durable memory database | `scripts/check durable` | Done: all seven slices |
| Recovery | `scripts/check recovery` | Done: page images, page groups, abort by the log, sharp checkpoint, ARIES, `scripts/crashtest --seeds 200` |

## Next

Planned in `PLAN.md`, in this order. None has tests yet; each starts by adding them.

| Feature | Check | Slices |
| --- | --- | --- |
| Page store in the shell | `scripts/check pagestore` | 10.1 directory format, 10.2 recovery on open, 10.3 statements log, 10.4 loads, 10.5 clean close and checkpoint, 10.6 verify, 10.7 crash test through the shell |
| Log housekeeping | `scripts/check logkeep` | 11.1 truncate after a checkpoint, 11.2 smaller page records, 11.3 fuzzy checkpoint |
| SPARQL breadth | `scripts/check sparql` | 12.1 `OPTIONAL`, 12.2 `UNION`, 12.3 aggregates, 12.4 planning around them, 12.5 `DELETE/INSERT WHERE` |
| RDFS inference | `scripts/check rdfs` | 13.1 rules, 13.2 materialize, 13.3 insert, 13.4 delete (DRed), 13.5 LUBM |

## Left open

These have no stubs. Each starts as a design written next to its code, then a benchmark, then a [writeup](research.html).

- Another eviction policy beside LRU-K.
- A different set of index permutations.
- MVCC beside strict two-phase locking.
- Leaf compression with delta-encoded keys.
- A query window that sends the same text the shell sends.
- Page checksums on the disk store, checked on read and by `\verify`.
- Restore to a chosen LSN: replay the snapshot and the log up to an LSN and stop.

::: next
The 24-byte key: `scripts/check key`. See [Triple indexes](indexes.html#the-24-byte-key).
:::
