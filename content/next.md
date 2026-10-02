---
title: What to build next
slug: next
order: 2
kicker: Roadmap
description: The features ontodb is building, the check command for each, and what is intentionally left open.
lede: The shell already answers queries. The next code is the 24-byte triple key. After that, each feature is one check command.
---

`scripts/status` prints one line per slice, grouped by feature. A slice counts only after its tests pass with the `DISABLED_` prefix removed. The shell smoke test and the explain smoke test already pass and are not part of the percentage. A fresh tree is 0 of 46.

`scripts/check key` builds and runs the triple-key slices, including tests that are still disabled, then prints the next id. `scripts/check 0.2` is the same slice by id. The concurrency feature uses the ThreadSanitizer preset.

## Already in place

Do not rebuild these. They are the baseline the features sit on.

- The shell, multi-session workers, and every command. Unbuilt commands print `not built yet (PLAN x.y)` and do not crash.
- A query may span lines, including a `PREFIX` before the `{ }` group. It runs when the braces close.
- `MemDictionary`, `MemStore`, and the raptor2 loader.
- Lexer, parser, and binder for the supported SPARQL subset.
- Left-deep planner, triple scan, nested-loop join, filter, and projection.
- The page frame, including an 8-byte pageLSN at offset 0.
- `LogRecord` factories and `Transaction` accessors. Serialization and the managers still throw.
- Query files, the isolation specs, and the crash harness. The harness self-tests pass. The real lock manager and the real store do not, yet.

## Features

| Feature | Check | Done when |
| --- | --- | --- |
| Triple key | `scripts/check key` | The 24-byte key round-trips and the prefix bounds match |
| Buffer pool | `scripts/check buffer` | Pinned frames return to zero |
| B+ tree | `scripts/check index` | Random insert matches a sorted vector |
| RDF storage | `scripts/check storage` | A clean restart sees the triples |
| Query execution | `scripts/check execution` | `\set join` selects a real operator |
| Optimizer | `scripts/check optimizer` | A rewritten plan returns the same rows |
| Bulk load | `scripts/check load` | About 100k LUBM triples load under a small pool |
| Concurrency | `scripts/check concurrency` | The feature is green under TSan |
| Recovery | `scripts/check recovery` | `scripts/crashtest --seeds 200` exits 0 |

Slice ids such as `1.4` and `8.6` stay in the test names and in `not built yet (PLAN x.y)`. The feature name is the one you pass to `scripts/check`.

## Left open

These have no stubs. Write the design next to the code, then a benchmark, then a [writeup](research.html).

- Another eviction policy beside LRU-K, compared in `benchmarks/eviction/`.
- A different permutation set, measured in `benchmarks/indexing/`.
- MVCC beside strict two-phase locking.
- Leaf compression with delta-encoded keys.
- RDFS `subClassOf` materialization.
- A query window that sends the same text the shell sends.

## How to read ahead

The notes follow the feature order. You can read [WAL and ARIES](recovery.html) before the disk exists. You cannot check slice 8.3 until the buffer pool flushes the log before the page write.

When a page says **Next**, that is the slice to point `scripts/check` at. Delete `DISABLED_` only after the test is honest. A disabled test that would have passed does not move `scripts/status`.

::: next
Start at [the 24-byte key](indexes.html#the-24-byte-key). `scripts/check key` is the command. The files are `src/include/storage/index/triple_key.h` and `src/storage/index/triple_key.cpp`.
:::
