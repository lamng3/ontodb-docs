---
title: Code design
slug: code-design
part: Internals
order: 10
kicker: Internals
description: The design patterns OntoDB's code uses, where each one lives, and the deliberate exceptions.
lede: OntoDB uses a small set of standard patterns, so a new method plugs in at a known place instead of growing a conditional.
---

## Patterns

| Pattern | Where |
| --- | --- |
| Iterator (volcano) | `TripleIterator`; every executor's `Init` / `Next` pulls one row at a time |
| Repository | `TripleStore` and `Dictionary` hide where triples and terms live (`MemStore`, `IndexedStore`; `MemDictionary`, `DiskDictionary`) |
| Factory | `ExecutorFactory::Create` maps a plan node to its executor; `Database::Open`; the `LogRecord` named constructors; `MakeDamagePolicy` |
| Builder | `Planner` builds the plan tree from a bound query |
| Strategy, replace conditional with polymorphism | `LogDamagePolicy`, one class per [recovery mode](persistence.html#recovery-on-open); `\set join` selects the join operator; `TraceSink` implementations |
| Null object | `NullTraceSink` when tracing is off |
| Decorator | `RecordingStore` wraps any `TripleStore` and records its changes, so a statement can be logged as one transaction or undone |
| Adapter | `RdfLoader` adapts raptor2's parser to `Dictionary` and `TripleStore` |
| Command | The shell's command table, one entry per backslash command, read by both dispatch and `\help`; log records are replayable commands |
| RAII | `ReadPageGuard` and `WritePageGuard` unpin on destruction |
| Dependency injection | `ExecutorContext` carries the store, dictionary, config, and stats into every executor; `LogManager`, `Durability`, and the buffer pool take their collaborators as constructor arguments |

## Adding to OntoDB

| To add | Where |
| --- | --- |
| A shell command | One entry in `tools/shell/commands.cpp`: word, usage, summary, handler. `\help` picks it up |
| An executor | A class with `Init` / `Next`, a plan node, and a case in `ExecutorFactory::Create` |
| A storage backend | A `TripleStore` implementation; the engine sees only the interface |
| A recovery mode | A `LogDamagePolicy` subclass and a case in `MakeDamagePolicy` |
| A verify check | A function returning a `CheckResult` (ok, report line), added to `Durability::Verify` |

## Deliberate exceptions

- **No retry on a failed fsync.** A log flush that fails is reported, not retried. After a failed fsync the kernel may already have dropped the dirty pages, so a retry that succeeds can still have lost data; this is the lesson of PostgreSQL's 2018 fsync incident.
- **One process-wide test hook.** `CrashPoint` is global because a crash point has to be reachable from any depth of any call. It does nothing unless a test arms it.
- **Constants, not literals.** Sizes and intervals have names: `PAGE_SIZE` and the defaults in `common/config.h`, `LogRecord::kHeaderSize` and `kMaxSize`, `kFlushInterval` in the log manager, and `kDefaultLogTail` in the shell.

::: read
Gamma, Helm, Johnson, and Vlissides, *Design Patterns*. Fowler, *Refactoring*, on replacing conditionals with polymorphism and extracting functions.
:::
