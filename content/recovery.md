---
title: WAL and ARIES
slug: recovery
part: Internals
order: 8
kicker: Internals
description: Write-ahead logging, checksummed log records, group commit, torn and corrupt records, page images and page groups, compensation records, the three ARIES passes, and the crash harness.
lede: OntoDB uses write-ahead logging and ARIES. Redo copies page images. Undo of a triple is logical. A split or merge reaches the log whole or not at all.
---

The policy is steal / no-force. Steal means a dirty page of an uncommitted transaction may be written. No-force means a committed transaction's pages need not be written yet. Commit only has to make the commit record durable. Both choices are why a log exists: steal requires undo, no-force requires redo.

## The WAL rule

A page is written only after every log record that describes that page image is durable. In the buffer pool that is a concrete order:

1. A write guard on a changed page is released. Still holding the latch, it calls `LogPageWrite`, which appends a page record (the page's bytes after its pageLSN) and sets the pageLSN to that record's LSN.
2. Before writing the page, the pool flushes the log up to that pageLSN.
3. The crash point `BufferPoolManager::FlushPage::before_disk_write` may fire.
4. The page is written.

`\crash` exits without flushing. Anything not forced dies with the process. The commit record is the acknowledgement the crash harness trusts. An insert is visible after restart only if that commit reached disk.

## Splits and merges: page groups

A split changes the old leaf, a new leaf, and the parent, and each gets its own page record. If the log reached the disk with the two leaves' records and not the parent's, redo would rebuild a tree whose parent never heard of the new leaf: a scan along the leaves finds every key, and a point lookup for a moved key misses it.

So a tree `Insert` or `Remove` opens a `PageGroup` before its first latch and closes it after its last. While a group is open, the log flushes nothing from the group's first LSN on, and the pool, choosing a victim, passes over a dirty page whose pageLSN is held back. A split or merge therefore reaches the log file whole or not at all, and none of its pages is written before it does.

ARIES solves the same problem with nested top actions, InnoDB with mini-transactions that keep every latch to the end, and PostgreSQL with B-link trees that tolerate a half split. Page groups need no before-images and no change to latching. The cost: a commit that arrives during a split waits for it, and the pool needs more frames than the largest split touches.

`test/recovery/recovery_test.cpp` stops a tree at each named crash point inside a split and a merge, flushes all the log allows, copies the files, and checks that redo gives a sound tree holding either the keys from before the operation or the keys from after it.

## Log records

Plan 8.1, done. `SerializeTo` writes `Size()` bytes. `Deserialize` reads one record. `Size()` on the deserialized record equals the number of bytes consumed.

Every record starts with its length and a CRC-32C, the checksum PostgreSQL, RocksDB, and InnoDB put on their log records. The checksum covers every byte after it.

```text
u32 size       whole record, header included
u32 crc32c     over every byte after this field
u8  type
i64 lsn, i64 txn_id, i64 prev_lsn
then, by type, the fields below
```

| Type | What it carries |
| --- | --- |
| begin, commit, abort | the transaction id |
| update | page id, whether this update inserted, and the triple |
| CLR | the update fields, and `undo_next` |
| checkpoint | the active transactions |
| term | a dictionary id and its canonical spelling |
| page | a page id and the page's bytes after its pageLSN |

The term record is for the memory database: replaying term records into an empty dictionary rebuilds the same ids.

Two failures are kept apart. A buffer shorter than the record throws `StorageException`; that is a torn final write, the expected shape of a crash. A record whose bytes are all there but wrong, with a bad checksum, a bad type, or an impossible size, throws `LogCorruptionException`.

`prev_lsn` chains the records of one transaction, newest toward the begin record.

## Log manager

An in-memory buffer and a background flush thread. `Append` assigns an LSN and returns it. `Flush(lsn)` blocks until every record up to that LSN is durable. Commit calls `Flush` with force. `StartFlushThread` starts the thread. `StopFlushThread` flushes the rest and joins. Each physical flush counts `LogFlush` when stats are installed. `\log` prints `DebugTail`, the last n records, oldest first.

Group commit: commits that arrive while a flush is running share that flush, so `GetFlushCount` grows slower than the number of commits. A single client pays the latency of its own flush. A crowd of clients pays one flush per batch. If every commit flushes alone, the group-commit test fails.

Plan 8.2, done. Opening a log that already has records continues its LSNs after the last valid one. LSNs start at 1. Without a running flush thread, `Flush` writes on the caller's thread. The destructor flushes; `\crash` exits without destructors, so whatever is buffered is lost.

## Torn and corrupt records

`ScanLog` returns the valid prefix of a log file and says where and why it stopped. What to do at that point is a policy, named after RocksDB's WAL recovery modes:

| Mode | Shell | What happens at the first bad record |
| --- | --- | --- |
| point in time | `ontodb <dir>` | Keep every transaction before it, truncate the log there, and print what was dropped |
| absolute consistency | `ontodb --strict <dir>` | Refuse to open |

Point in time is also what a torn final write needs, so it is the default. A transaction whose commit record is past the bad record is not committed, which is the same answer a crash gives.

`\verify` is the offline check, in the spirit of PostgreSQL's `pg_amcheck`, MySQL's `CHECK TABLE`, and RocksDB's `VerifyChecksum`. It reads the snapshot and the log, checks both checksums, rebuilds the database into a fresh store, compares it with the live one, and checks that no triple is duplicated and every id is in the dictionary. It changes nothing.

## Abort and compensation

Plan 8.4, done. When the transaction manager was given a log, the statement logs each triple change before making it (`LogUpdate`), and abort undoes by the log, newest first: delete what was inserted, insert what was deleted, then a CLR, then an abort record. The write-set path remains for a null log.

A CLR's `undo_next` is the previous LSN of the record you just undid. Undo stops at a CLR whose `undo_next` is invalid, or at the begin record. A CLR is redone, and it is not undone. Undoing a CLR would redo the original update and then need another CLR, which is how undo loops.

After abort the triple is gone and the log contains the CLR.

The CLR comes after the change, so a crash in the middle of an undo makes the next recovery repeat it. One triple lives in three trees; a page group makes each tree's change atomic, not the three together. `IndexedStore::Insert` and `Delete` therefore change every index that disagrees instead of asking the first and stopping. A repeated undo repairs the indexes the interrupted one did not reach.

## Checkpoints

Plan 8.5, done. `CheckpointManager::Checkpoint` is sharp: it writes every dirty page (the pool forces the log first), then appends a checkpoint record listing the active transactions and forces it. Updates must not run meanwhile. After a sharp checkpoint nothing older needs redo, so the record carries no dirty page table. A fuzzy checkpoint, which never stops the system, is the optimization that would come next.

After `Checkpoint` returns, `LastCheckpointLsn` is that record and the record is durable. Before the first checkpoint, `LastCheckpointLsn` returns `INVALID_LSN`. The log is not truncated after a checkpoint yet.

A checkpoint is a bookmark for recovery. It is not a SPARQL snapshot. How pages, the log, deletes, and scans persist is [Disk persistence design](durability.html).

## The three passes

Plan 8.6, done. `LogRecovery` (`src/recovery/recovery.cpp`) reads the log and runs three passes. `Summary` is one line per pass: `analysis ...`, `redo ...`, `undo ...`.

**Analysis** finds winners (a commit record), losers (a begin, update, or CLR with neither a commit nor an abort record), and the dirty page table: each page's first page record after the last checkpoint. The redo LSN is the smallest of those.

**Redo** repeats history. For each page record from the redo LSN on, it fetches the page through the pool's raw interface, so redo is not logged again, and copies the image if the record is newer than the pageLSN. Winners and losers alike: that is what makes the later undo start from a known state. A page past the end of the file reads as zeros.

**Undo** runs after the catalog is opened, because redo may be what restored page 0. Each loser's update records are undone newest first through the same `UndoChain` a normal abort uses, with a CLR for each and an abort record at the end. Undo is logical because the page a triple lives on may have been split after the insert. The key is the triple, not the slot it occupied when the log was written.

## Why a split is not undone

A B+ tree split or merge is never undone. Its pages come back by redo only, and page records belong to no transaction. If you undid a split, you would undo other transactions' committed inserts that landed in the new leaf since. Undo of a loser walks only its logical triple records, and the tree performs each inverse wherever the key lives now.

## The crash harness

`scripts/crashtest --seeds N` sets `ONTODB_CRASH_SEEDS` and runs the harness. The oracle is a memory store that replays only acknowledged commits. A committed insert must be visible after restart. An uncommitted insert must not.

Plan 8.7, done: `scripts/crashtest --seeds 200` passes, in about two minutes. The child is the test binary with `--crash-child`, started with `posix_spawn` because a raw `fork` under ASan with live threads is a bad time. It opens a real store: a database file, three trees with at most four keys a node so a few dozen triples split and merge, a 16-frame pool so pages are stolen, and the log. The parent feeds it a random schedule and kills it. A third of the seeds die between operations, and the rest at a random reach of a named crash point (inside a split, a merge, or between a log flush and a page write), half of them after flushing everything the log allows.

The parent reopens the store (a torn last record is cut off, then the three passes) and compares it with the oracle. It also checks each tree's invariants, a point lookup for every triple, and that SPO, POS, and OSP hold the same triples. A corrupt tree fails the seed with an error rather than hanging: descents stop at 64 levels or at a page they already hold, and the leaf iterator stops when keys go backward or empty leaves cycle.

The harness proves it can see a lie. Fake stores that forget a commit or keep an uncommitted write fail. Against the real store, removing redo fails 30 of 30 seeds, removing page groups fails 25 of 200, and asking only the first index in `Insert` and `Delete` fails 4 of 200. The first version of the harness killed only between operations on a workload too small to split a page, and passed with both of the last two bugs present.

::: today
8.1 to 8.7 pass. The page path runs wherever a buffer pool is given a log manager: the recovery tests and the crash harness. The shell does not open a page store from a directory yet. With a directory, `\log`, `\checkpoint`, `\crash`, and `\verify` work on the [persistent database](persistence.html), which uses these records and this log manager with logical redo. The shell's indexed backend is a temporary file without a log.
:::

::: read
Mohan, Haderle, Lindsay, Pirahesh, and Schwarz, "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging". Petrov, chapter 5. Read the nested-top-action section, then compare it with page groups.
:::
