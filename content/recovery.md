---
title: WAL and ARIES
slug: recovery
part: Internals
order: 8
kicker: Internals
description: Write-ahead logging, checksummed log records, group commit, torn and corrupt records, compensation records, and the three ARIES passes OntoDB will run on open.
lede: OntoDB uses write-ahead logging and ARIES. Redo is page-oriented. Undo of a triple is logical. A B+ tree split is redone, not undone.
---

The policy is steal / no-force. Steal means a dirty page of an uncommitted transaction may be written. No-force means a committed transaction's pages need not be written yet. Commit only has to make the commit record durable. Both choices are why a log exists: steal requires undo, no-force requires redo.

## The WAL rule

A page is written only after every log record that describes that page image is durable. In the buffer pool that is a concrete order:

1. The update sets the page's pageLSN to the LSN of its log record.
2. `FlushPage` flushes the log up to that pageLSN.
3. The crash point `BufferPoolManager::FlushPage::before_disk_write` may fire.
4. The page is written.

`\crash` exits without flushing. Anything not forced dies with the process. The commit record is the acknowledgement the crash harness trusts. An insert is visible after restart only if that commit reached disk.

::: next
Plan 8.3, after the log manager can flush. The test expects the new bytes to be absent from the file when the crash point fires. Run `scripts/crashtest` once with the log flush commented out, read the failure, and put the flush back.
:::

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

When the transaction manager was given a log, abort undoes by the log, newest first, and writes a CLR for each undone triple. The write-set path remains for a null log.

A CLR's `undo_next` is the previous LSN of the record you just undid. Undo stops at a CLR whose `undo_next` is invalid, or at the begin record. A CLR is redone, and it is not undone. Undoing a CLR would redo the original update and then need another CLR, which is how undo loops.

After abort the triple is gone and the log contains the CLR.

## Checkpoints

`Checkpoint` writes a checkpoint record and remembers its LSN. Blocking or fuzzy is your choice. Say which in the comment above `Checkpoint`. A blocking checkpoint is enough. A fuzzy one needs a dirty-page table and a transaction table in the record. Do not start with fuzzy.

After `Checkpoint` returns, `LastCheckpointLsn` is that record and the record is durable. `\checkpoint` calls this. Until then, `LastCheckpointLsn` returns `INVALID_LSN` and does not throw. Calling `Checkpoint` throws `PLAN 8.5`.

A checkpoint is a bookmark for recovery. It is not a SPARQL snapshot. How pages, the log, deletes, and scans persist is [Disk persistence design](durability.html).

## The three passes

Opening a database runs recovery and prints `Summary`, one line per pass: `analysis ...`, `redo ...`, `undo ...`.

**Analysis** reads the log from the last checkpoint, or from the start. It finds winners (transactions that committed), losers (transactions that started and did not commit), and the redo LSN, which is the earliest LSN that might describe a page still dirty at the crash.

**Redo** repeats history. It replays every page update whose LSN is greater than the page's pageLSN, including CLRs. A page that already has a newer pageLSN is skipped. Redo is page-oriented because the log record says what bytes (or what page update) to install, and the page on disk might be any prefix of history. You do not ask whether the transaction committed. Winners and losers are both redone. That is what makes the later undo start from a known state.

**Undo** walks losers newest-first and writes a CLR for each logical triple it removes or restores. Undo is logical because the page a triple lives on may have been split after the insert. The key is the triple, not the slot it occupied when the log was written.

## Why a split is not undone

A B+ tree split or merge is not undone as "delete the inserted key" or "reinsert the deleted key". Those pages come back by redo only.

If you undid a split logically, you would delete a key the user committed, or resurrect one they deleted, whenever the split was shared with a later committed operation. Log the split as a redo-only nested top action, and log the logical triple insert as its own update record. Analysis and redo install the split. Undo of a loser only walks the logical triple records, and it stops when it hits the nested top action's CLR boundary.

The crash points inside insert and remove are the places a kill may land after more than one page has changed and before the operation has returned.

## The crash harness

`scripts/crashtest --seeds N` sets `ONTODB_CRASH_SEEDS` and runs the harness. The oracle is a memory store that replays only acknowledged commits. A committed insert must be visible after restart. An uncommitted insert must not.

The harness already proves it can see a lie. A fake store that forgets a commit fails, and the report mentions a missing triple. A fake store that keeps an uncommitted write fails, and the report mentions an unexpected triple. A correct fake store passes. The fork path uses `posix_spawn` and `SIGKILL` because a raw `fork` under ASan with live threads is a bad time. The child is the test binary with `--crash-child`.

Plan 8.7 points that same oracle at the real store. `scripts/crashtest --seeds 200` is the bar.

::: today
8.1 and 8.2 pass. With a directory, `\log`, `\checkpoint`, `\crash`, and `\verify` work on the [persistent database](persistence.html), which uses these records and this log manager with logical redo. Without one, `\log`, `\checkpoint`, and `\crash` print `not built yet`. The page path, 8.3 to 8.7, is still to build. The harness self-tests pass.
:::

::: read
Mohan, Haderle, Lindsay, Pirahesh, and Schwarz, "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging". Petrov, chapter 5. Read the nested-top-action section before you design split logging.
:::
