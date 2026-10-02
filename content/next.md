---
title: What to build next
slug: next
order: 2
kicker: Roadmap
description: The build order for ontodb, from TripleKey through ARIES, and what already counts as done.
lede: Orientation is done. The next code to write is the 24-byte triple key. Everything after that follows the dependency order below.
---

`scripts/status` prints one line per item and a percentage. An item counts only after its tests pass with the `DISABLED_` prefix removed. Orientation items 0.1 and 0.3 are already enabled and do not count. A fresh tree is 0 of 46.

`scripts/check 0.2` builds and runs that item, including tests that are still disabled, then prints the next id. Phase 7 checks use the ThreadSanitizer preset.

## Already in place

Do not rebuild these. They are the baseline the later items sit on.

- The shell, multi-session workers, and every command. Unbuilt commands print `not built yet (PLAN x.y)` and do not crash.
- `MemDictionary`, `MemStore`, and the raptor2 loader.
- Lexer, parser, and binder for the supported SPARQL subset.
- Left-deep planner, triple scan, nested-loop join, filter, and projection.
- The page frame, including an 8-byte pageLSN at offset 0.
- `LogRecord` factories and `Transaction` accessors. Serialization and the managers still throw.
- Query files, the isolation specs, and the crash harness. The harness self-tests pass. The real lock manager and the real store do not, yet.

## The order

| Item | Component | You are done when |
| --- | --- | --- |
| 0.2 | TripleKey encode, compare, prefix bounds | `P0_2` passes without `DISABLED_` |
| 1.1–1.6 | Disk, scheduler, LRU-K, buffer pool, guards, `\bpm` | Pinned frames return to zero |
| 2.1–2.7 | B+ tree layout, search, insert, scan, bulk load, delete | Random insert matches a sorted vector |
| 3.1–3.6 | Term heap, disk dictionary, catalog, indexed store, permutations | Restart sees the triples |
| 4.1–4.6 | Rebind scans, index NLJ, hash join, distinct/limit, sort, insert executor | `\set join` selects a real operator |
| 5.1–5.5 | Statistics, cardinality, join order, join method, explain analyze | Rewritten plans return the same rows |
| 6.1–6.2 | Bulk load in the loader, LUBM(1) | About 100k triples under a small pool |
| 7.1–7.6 | Crabbing, transactions, locks, isolation, deadlock, phantoms | Phase 7 is green under TSan |
| 8.1–8.7 | Log records, log manager, WAL, CLR undo, checkpoint, ARIES, crash test | `scripts/crashtest --seeds 200` exits 0 |

Phase 9 has no stubs. It is open design: MVCC, leaf compression, RDFS materialization, a sixth permutation, or a workload generator. Write the design down before writing the code.

## How to read ahead

The notes are in dependency order, not in the order a textbook introduces the words. You can read [WAL and ARIES](recovery.html) before the disk exists. You cannot check plan 8.3 until the buffer pool flushes the log before the page write.

When a page says **Next**, that is the item `scripts/check` should be pointed at. Delete `DISABLED_` only after the test is honest. A disabled test that would have passed does not move `scripts/status`.

::: next
Start at [the 24-byte key](indexes.html#the-24-byte-key). `scripts/check 0.2` is the command. The files are `src/include/storage/index/triple_key.h` and `src/storage/index/triple_key.cpp`.
:::
