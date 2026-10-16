---
title: Persistent databases
slug: persistence
part: Using OntoDB
order: 4
kicker: Using OntoDB
description: Keeping a database on disk: transactions, the write-ahead log, checkpoints, recovery on open, recovery modes, verify, and what is durable when.
lede: Start the shell with a directory and the database lives there. Every update is a transaction, and reopening the directory restores every committed transaction.
---

## The directory

```text
mydb/
  snapshot    a full image of the database at one LSN (after the first \checkpoint)
  wal         every log record after the snapshot
```

Do not edit either file. Both carry checksums, and a change is reported as damage.

## Transactions

Each update statement and each `\load` is one transaction. OntoDB applies it, writes its log records (begin, any new dictionary terms, one record per changed triple, commit), and forces the commit to disk before printing the result. When you see `inserted 1 triple`, the triple will be there after a crash.

A statement that fails partway is undone, and nothing it changed is visible. A statement that changes nothing writes nothing to the log.

## Checkpoints

`\checkpoint` writes a snapshot and empties the log:

```text
OntoDB> \checkpoint
checkpoint at lsn 37: 18 terms, 15 triples; wal reset
```

The snapshot is written to a temporary file, synced, and renamed over the old one, so a crash leaves either the old snapshot or the new one. If a crash comes after the rename but before the log is emptied, the next open skips every log record the snapshot already contains. Checkpoint when the log has grown, to make the next open faster.

## Recovery on open

Opening a directory loads the snapshot, then replays the log after it. Only transactions with a commit record are applied; a transaction cut off by a crash leaves no trace. The first line says what happened:

```text
opened mydb: snapshot at lsn 61 (28 triples); wal 3 records, 1 committed, 0 uncommitted dropped; 27 triples
```

If the log ends in a damaged record, there are two modes:

| Mode | Start with | At the first damaged record |
| --- | --- | --- |
| Point in time (default) | `ontodb mydb` | Keeps every transaction before it, cuts the log there, and prints a warning with the number of bytes discarded |
| Absolute consistency | `ontodb --strict mydb` | Refuses to open |

A torn final record is what a crash usually leaves, and point in time is the right answer for it. Use `--strict` when any damage should stop you so you can inspect the files first. A damaged snapshot always refuses to open.

## Verify

```text
OntoDB> \verify
snapshot: ok (lsn 37, 18 terms, 15 triples)
wal: ok (0 records, 0 bytes)
replay: matches the live database (15 triples)
invariants: ok (no duplicate triples, every id in the dictionary)
verify: ok
```

`\verify` checks the snapshot and log checksums, rebuilds the database from the two files into a fresh store, compares it with the live database, and checks that no triple is stored twice and every id resolves in the dictionary. It changes nothing. A `FAILED` line names what is wrong.

## What is durable when

| Event | Durable after |
| --- | --- |
| An update or `\load` prints its result | Its commit record is on disk |
| A statement fails | Nothing; it was undone |
| `\checkpoint` returns | The new snapshot, and an empty log |
| `\quit` | Everything committed |
| `\crash` or a killed process | Everything committed; anything else is lost |

## Limits

- One process per directory. Two shells on the same directory are not supported.
- The whole database is held in memory; the directory is its durable copy. The page-based disk store, which does not need to fit in memory, exists and recovers from crashes in the tests, but the shell does not open it from a directory yet (see [Roadmap](next.html)).

The file layouts are in [File formats](formats.html).
