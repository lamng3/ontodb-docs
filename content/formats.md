---
title: File formats
slug: formats
part: Reference
order: 1
kicker: Reference
description: The byte layout of a log record and the text layout of a snapshot in a persistent OntoDB database.
lede: A persistent database is two files, a snapshot and a write-ahead log. Both carry a CRC-32C checksum.
---

## Write-ahead log (`wal`)

The log is a sequence of records, each self-describing. Fields are in the machine's native byte order.

```text
u32 size       whole record, header included
u32 crc32c     over every byte after this field
u8  type
i64 lsn        log sequence number, from 1
i64 txn_id
i64 prev_lsn   previous record of the same transaction
then, by type:
  update       i32 page_id, u8 is_insert, u64 subject, u64 predicate, u64 object
  clr          the update fields, then i64 undo_next
  checkpoint   u32 n, then n x i64 active transaction ids
  term         u64 term_id, u32 n, then n bytes of the canonical spelling
  begin, commit, abort: nothing more
```

| Type | Written by a persistent database | Meaning |
| --- | --- | --- |
| begin | Yes | A transaction starts |
| term | Yes | A dictionary entry: id and spelling. Replayed in order so ids are identical after a restart |
| update | Yes | One triple inserted or deleted, as three dictionary ids. `page_id` is `-1`: the in-memory store has no pages |
| commit | Yes | The transaction is durable |
| abort, clr, checkpoint | No | Reserved for the page-based store's recovery |

The checksum is CRC-32C (Castagnoli), as in PostgreSQL, RocksDB, and InnoDB log records. A record that is cut short is a torn write; a record whose bytes are all present but whose checksum, type, or size is wrong is corruption. Both stop replay at that record; see [Recovery on open](persistence.html#recovery-on-open).

## Snapshot (`snapshot`)

A text file: a header, a blank line, then the body.

```text
ontodb-snapshot 1
lsn 37
txn 3
terms 18
triples 15
crc32c 1a2b3c4d

T	<http://example.org/materials#Material>
T	"Material"
...
S 2 9 1
...
```

| Line | Meaning |
| --- | --- |
| `lsn` | The last log record the snapshot includes |
| `txn` | The next transaction id |
| `terms`, `triples` | Counts, checked on read |
| `crc32c` | Eight hex digits, over the whole body |
| `T<tab>spelling` | One dictionary term; the first is id 1, the next id 2, and so on |
| `S s p o` | One triple, as three term ids |

A snapshot is written to `snapshot.tmp`, synced, and renamed over `snapshot`. A wrong header, count, or checksum refuses to open.
