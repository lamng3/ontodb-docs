---
title: Messages and troubleshooting
slug: troubleshooting
part: Reference
order: 2
kicker: Reference
description: What OntoDB's messages mean, and what to do about a damaged or unexpected database.
lede: Every message names its cause. This page lists them by where they appear.
---

## In the shell

| Message | Meaning | What to do |
| --- | --- | --- |
| `not built yet (PLAN x.y)` | The command or operator belongs to a feature still being built | See [Roadmap](next.html) |
| `error: OPTIONAL is not supported at line 1, column 30` | The statement uses SPARQL outside the supported subset | See [SPARQL reference](sparql.html) |
| `error: ... at line L, column C` | A parse or bind error | Fix the statement at that position |
| `error: usage: \load <file>` | A command is missing an argument | Run `\help` |
| `error: unknown command (try \help)` | A backslash line that is not a command | Run `\help` |
| `error: nothing on disk to verify; ...` | `\verify` in an in-memory database | Start the shell with a directory |
| `error: ...` | Any other failure. The statement changed nothing | Read the message |

## When opening a directory

| Message | Meaning | What to do |
| --- | --- | --- |
| `opened dir: ... N uncommitted dropped` | N transactions had no commit record, usually from a crash | Nothing; this is recovery working |
| `warning: wal stopped: ... at byte B; discarded D bytes` | The log had a torn or damaged record. Everything before it was kept | Run `\verify`. If damage was not expected, check the disk |
| `error: wal: ... not opening in absolute-consistency mode` | `--strict` found a damaged log record | Copy the directory, then open without `--strict` to recover the valid part |
| `error: snapshot: checksum mismatch` (or a bad header or count) | The snapshot file was changed or damaged | Restore it from a copy. A damaged snapshot cannot be recovered automatically |
| `error: wal: lsn N gives term T a different spelling` | The log disagrees with the snapshot about a dictionary id | The files come from different databases, or one was edited |

## Questions

**A query for a class does not return instances of its subclasses.** OntoDB does not reason; `subClassOf` is data. See [No reasoning](sparql.html#no-reasoning).

**A load is slow on a large file.** The in-memory store is not indexed. See [Loading data](data.html#larger-data-sets).

**The log keeps growing.** Run `\checkpoint`.
