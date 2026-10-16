---
title: Roadmap
slug: next
part: Project
order: 2
kicker: Project
description: What OntoDB can do now, what is being built next, and what is deliberately left open.
lede: All 53 slices are done, page-level recovery included. Next is moving the shell's persistent databases onto the page store, then the open items below.
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

Not in `PLAN.md` yet. Each would start as a design next to its code.

- `ontodb <dir>` on the page store: open the database file and its log, run recovery, and keep the memory database as an option.
- Truncate the log after a checkpoint, once no loser or dirty page needs the older records.
- Fuzzy checkpoints, so updates do not stall.
- Smaller page records: a diff, or a full image only on a page's first change after a checkpoint.

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
