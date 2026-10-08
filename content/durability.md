---
title: Persistence and snapshots
slug: durability
order: 12
kicker: Durability
description: How OntoDB persists pages and the log, reclaims space on delete, and what a checkpoint or a scan actually freezes.
lede: Pages and a write-ahead log are the durable state. Deletes shrink the B+ tree in place. A checkpoint is a recovery bookmark, and a scan freezes only the triples it already copied.
---

Three words get borrowed from log-structured stores and do not name three background jobs here. Persistence is the database file plus the log. Space comes back when a delete merges or reuses a slot. A snapshot, in the form this store ships, is either a copied scan result or a lock held until commit.

## Persistence

Two files, once the disk path exists.

The database file is a sequence of 4096-byte pages. `DiskManager` owns it. Page ids survive restart. Each page image starts with an 8-byte pageLSN. The catalog page records the root of `spo`, `pos`, `osp`, and the dictionary. Term spellings live in the term heap, which is more pages in that same file. Triple keys live in the B+ tree leaves.

The log is a separate append-only file. `LogManager` is constructed with a `log_path`. `Append` assigns an LSN. `Flush` makes every record up to that LSN durable. Commit forces the commit record. That commit record is the acknowledgement a later open will trust.

::: today
Nothing is durable. `MemStore` and `MemDictionary` live in the process. Opening a path prints that recovery is not built and starts an empty memory database. `DiskManager::ShutDown` throws plan 1.1. `FlushAllPages` throws plan 1.4. `Checkpoint` throws plan 8.5.
:::

A clean close and a crash are different successes.

A clean close is plan 3.6. Flush every dirty frame, flush the catalog, then `ShutDown` the file. The next process reads the pages and does not need the log. An unflushed dirty frame is a lost triple even when nobody crashed.

A crash is the recovery feature. The policy is steal / no-force, described in [WAL and ARIES](recovery.html). An uncommitted page may already be on disk. A committed page may not be. Redo installs committed history the pages missed. Undo removes loser triples the pages kept. `\crash` exits without flushing, which is how you test that path on purpose.

What becomes durable, and when:

| Event | Durable after |
| --- | --- |
| Insert still in a transaction | the log record, only if a dirty page was stolen and the WAL rule flushed first |
| `\commit` | the commit record is on the log |
| `\checkpoint` | the checkpoint record, and whatever a blocking checkpoint also forced |
| Process exit through `ShutDown` | every dirty page and the catalog |
| `\crash` | only what a previous flush already wrote |

The shell knobs `pool_size` and `lru_k` change which pages stay in memory. They do not change the file format.

::: next
Plan 1.1 creates the database file. Plan 3.6 is the clean restart. Plans 8.1 through 8.7 are the log, the WAL rule, and crash recovery. Build the clean close before you depend on ARIES, so a shutdown bug is not mistaken for a recovery bug.
:::

## Reclaiming space

The index is one B+ tree per permutation. A key lives in exactly one leaf of that tree. A delete removes the key and then merges or redistributes so every node except the root stays at least half full. That work finishes inside `BPlusTree::Remove`, before the call returns. There is no later job that rewrites sorted runs.

A missing key deletes nothing. A removed key does not stay behind as a marker for a reader to skip. Readers of a leaf see the keys that are still there. Crash recovery can still undo that delete, by the logical triple record and a CLR, if the transaction did not commit. The leaf after recovery contains the key again because undo put it back, not because a tombstone was compacted away.

The term heap is looser. `Delete` on a heap page frees a slot, and a later insert may reuse it. `FreeSpace` counts that hole. Nothing in the plan rewrites a heap page to slide the survivors together, so a page can stay sparse when the hole is smaller than the next spelling. Deleting a triple does not drop the spelling. The dictionary keeps the id, a later insert of the same IRI gets that same id, and a log record written earlier still names it.

Bulk load is the other time the tree gets dense. Plan 2.6 builds full leaves from keys that are already sorted. Plan 6.1 does that at `\load` instead of inserting one triple at a time. Random `Insert` leaves a lower fill factor. That is a property of the tree you built, not a debt a compactor will come back to pay.

Leaf compression is smaller keys inside a leaf, delta-encoded the RDF-3X way. It has no stub. It changes `Compare` and the prefix bounds. It is a page layout, written when the leaf is written, not a background rewrite of old levels.

The log grows for the life of the process under the plan as written. A checkpoint tells recovery where to start. It does not, by itself, delete bytes in front of that LSN. Truncating the log after a checkpoint, once no active transaction or dirty page still needs the older records, is the natural follow-on of plan 8.5. It is not a separate plan item. Do it only after redo's starting LSN is real, or you will throw away the record that would have repaired a stolen page.

Which permutations exist is the other space decision. Plan 3.5 measures before adding POS or OSP. A permutation you do not build does not need a compaction policy.

::: next
The delete path is slice 2.7. The heap slot is slice 3.1. Bulk load is slices 2.6 and 6.1. Leaf compression comes after you can say what it does to prefix bounds, and the note belongs in a [writeup](research.html).
:::

## What a snapshot is here

`MemStore::Scan` copies the matching triples into the iterator and then drops the mutex. Inserts and deletes that happen after `Scan` returns do not change that iterator. The copy is one pattern's result, held for one operator. It is not a named database snapshot, and it is not repeatable across a second `Scan` in the same query. The indexed iterator does not copy the tree. It pins one leaf at a time, so a concurrent split is the crabbing problem in plan 7.1, not a frozen view.

`\checkpoint` writes a checkpoint record: the active transactions, and the LSN recovery may start from. A blocking checkpoint waits until writers are quiet and can force dirty pages. A fuzzy checkpoint does not wait, and it must record the dirty-page table. Either way, a SPARQL query does not read "as of" that checkpoint. Open after a crash does.

Repeatable read holds shared locks on the keys you read until commit. That keeps those triples from changing. It does not freeze the store. An insert of a triple you did not lock can still appear in a second scan. That is the phantom in plan 7.6. Serializable adds a range lock, a gap lock, or a predicate lock so the insert waits. The frozen set is the lock set, not a timestamp.

A versioned snapshot, where a reader ignores locks and sees the store as of its start timestamp, is the MVCC design. It has no stub. If you build it, old versions have to stay until every reader that might need them has finished, and only then can a delete drop the version. That reclamation is part of the design you write down before the code, then measure, then cite from a [writeup](research.html). It is not a job the B+ tree already runs.

::: read
Petrov, chapter 3, on a clean close versus a crash, and chapter 4, on merge and fill factor. Mohan et al., ARIES, on checkpoints and how far back redo must read. RDF-3X, on delta-encoded leaves.
:::
