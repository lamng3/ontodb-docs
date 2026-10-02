---
title: WAL and ARIES
slug: recovery
order: 11
kicker: Recovery
description: Write-ahead logging, group commit, compensation records, and the three ARIES passes ontodb will run on open.
lede: ontodb uses write-ahead logging and ARIES. Redo is page-oriented. Undo of a triple is logical. A B+ tree split is redone, not undone.
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

The byte layout is yours. `SerializeTo` writes `Size()` bytes. `Deserialize` reads one record and throws `StorageException` when the buffer is short. Put the length in the record so a torn tail is detectable. `Size()` on the deserialized record equals the number of bytes consumed.

| Type | What it carries |
| --- | --- |
| begin, commit, abort | the transaction id |
| update | the triple, and whether this update inserted it |
| CLR | the triple undone, and `undo_next` |
| checkpoint | the active transactions |

The factories already fill those fields. `Size`, `SerializeTo`, and `Deserialize` throw `PLAN 8.1`.

`prev_lsn` chains the records of one transaction, newest toward the begin record.

## Log manager

An in-memory buffer and a background flush thread. `Append` assigns an LSN and returns it. `Flush(lsn)` blocks until every record up to that LSN is durable. Commit calls `Flush` with force. `StartFlushThread` starts the thread. `StopFlushThread` flushes the rest and joins. Each physical flush counts `LogFlush` when stats are installed. `\log` prints `DebugTail`, the last n records, oldest first.

Group commit: commits that arrive while a flush is running share that flush, so `GetFlushCount` grows slower than the number of commits. A single client pays the latency of its own flush. A crowd of clients pays one flush per batch. If every commit flushes alone, the group-commit test fails.

The constructor does not throw. `StartFlushThread` throws `PLAN 8.2` until you write it.

## Abort and compensation

When the transaction manager was given a log, abort undoes by the log, newest first, and writes a CLR for each undone triple. The write-set path remains for a null log.

A CLR's `undo_next` is the previous LSN of the record you just undid. Undo stops at a CLR whose `undo_next` is invalid, or at the begin record. A CLR is redone, and it is not undone. Undoing a CLR would redo the original update and then need another CLR, which is how undo loops.

After abort the triple is gone and the log contains the CLR.

## Checkpoints

`Checkpoint` writes a checkpoint record and remembers its LSN. Blocking or fuzzy is your choice. Say which in the comment above `Checkpoint`. A blocking checkpoint is enough. A fuzzy one needs a dirty-page table and a transaction table in the record. Do not start with fuzzy.

After `Checkpoint` returns, `LastCheckpointLsn` is that record and the record is durable. `\checkpoint` calls this. Until then, `LastCheckpointLsn` returns `INVALID_LSN` and does not throw. Calling `Checkpoint` throws `PLAN 8.5`.

A checkpoint is a bookmark for recovery. It is not a SPARQL snapshot. How pages, the log, deletes, and scans persist is [Persistence, compaction, and snapshots](durability.html).

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
Opening a path prints `recovery not built yet (PLAN 8.6)` and uses an empty memory database. `\log`, `\checkpoint`, and `\crash` print `not built yet`. The harness self-tests pass.
:::

::: read
Mohan, Haderle, Lindsay, Pirahesh, and Schwarz, "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging". Petrov, chapter 5. Read the nested-top-action section before you design split logging.
:::
