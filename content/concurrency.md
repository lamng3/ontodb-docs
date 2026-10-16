---
title: Concurrency
slug: concurrency
part: Internals
order: 7
kicker: Internals
description: Strict 2PL, hierarchical locks, isolation levels, deadlock detection, and phantoms in OntoDB.
lede: Two shell sessions share one store. Locks decide which triples they may see. Latches decide which pages they may touch.
---

The shell is autocommit unless you say `\begin`. `\commit` and `\abort` end the explicit transaction. `\session N` runs the following commands on worker N. A blocked session prints `session 2 waiting: X lock held by txn 5`.

Isolation is a setting: `\set isolation ru|rc|rr|ser`. The default in `Config` is read committed.

The concurrency feature runs under ThreadSanitizer. `scripts/check concurrency` builds the `tsan` preset.

## Latches and locks

A latch is held for a tree operation and is released before the operation returns. That protocol is [crabbing](b-plus-tree.html#crabbing). A lock is held for a transaction. Strict 2PL means an exclusive lock is held until commit or abort, at every isolation level, including read uncommitted. Releasing an exclusive lock early would let another transaction read or write a value this transaction might still abort.

## Lock modes

Resources are the database, an index (`"spo"`, `"pos"`, `"osp"`), and a key. Take `IS` or `IX` on the database and on the index before `S` or `X` on a key. Grant order on one resource is FIFO.

| Mode | Compatible with |
| --- | --- |
| IS | IS, IX, S, SIX |
| IX | IS, IX |
| S | IS, S |
| SIX | IS |
| X | nothing |

The same transaction may upgrade in place. An upgrade does not jump ahead of a waiter. `Lock` blocks until the request is granted or the transaction is aborted. Before blocking, if a session was passed in, call `SetWaiting` with the reason, and `ClearWaiting` when the wait ends. The waiting thread is the one inside `Lock`, so the reason has to be set before the wait. The shell polls it.

OntoDB's lock manager (plan 7.3, done) keeps a FIFO queue per resource. A request is granted when it is compatible with every lock other transactions hold there and nothing ahead of it is still waiting. An upgrade keeps its old lock while it waits, queued behind any waiter, and replaces it when granted; a mode the transaction already covers is granted at once. Holders are recorded by transaction id, so a lock outliving its `Transaction` object does no harm. Two sessions that read a key and then both try to change it therefore deadlock on the upgrade, and the detector resolves it.

## Isolation

The specs in `test/isolation/specs/` are the contract. Twelve of them cover dirty read, nonrepeatable read, lost update, lock upgrade, two deadlocks, write-write conflict, abort releasing locks, and phantoms.

What OntoDB locks (plans 7.4 to 7.6, done). Exclusive locks: always, until commit.

| Level | A scan locks |
| --- | --- |
| ru | nothing |
| rc | S on each triple it returns |
| rr | S on each triple it returns, and S on the set of triples |
| ser | S on the whole database, for each query |

Shared locks are kept until commit at every level that takes them. That is stricter than the textbook read committed, which releases them at the end of each statement; the specs require it, because `lock-upgrade` and `upgrade-deadlock` run at read committed and expect a key read by an earlier statement to block a later delete. Read committed still forbids dirty reads and still lets new triples appear.

Locks name logical triples, not index entries: the database, then the set of triples (named `spo`), then one triple keyed by its SPO key, whichever index a scan used. A scan takes S on a triple before returning it; if that lock had to wait, it checks the triple is still there, since the writer may have aborted. A write takes IX on the database and the set, X on the triple, and records the change in the write set. A statement outside `\begin` runs in its own implicit transaction, so every statement locks the same way. `\load` takes X on the whole database instead of one lock per triple. A persistent database does not accept `\begin` yet: its log commits each statement on its own. The specs pass on both backends.

The mechanism is locks, not snapshots. MVCC is an open design with no stub. It is not a substitute you slip into the concurrency feature. A versioned reader is described with [snapshots](durability.html#what-a-snapshot-is-here).

## Deadlock

A background thread wakes every 20 ms, builds the waits-for graph (an edge from each waiting request to every transaction holding an incompatible lock, or waiting ahead of it), and aborts the youngest transaction in each cycle. Younger means the larger id. The abort throws `TransactionAbortException` out of that transaction's `Lock` call. Aborting whoever happened to notice the cycle fails the spec: session 1 starts first, so it has the smaller id, and session 2 is the victim in both the two-key cycle and the upgrade cycle.

## Phantoms

Repeatable read holds locks on triples you read. An insert of a new triple does not conflict with those locks, so a second scan can see Dana even though the first scan did not. The repeatable-read spec expects that. Do not "fix" it by taking a predicate lock at every isolation level.

OntoDB's choice: repeatable read takes S on the set of triples for each scan that runs, and serializable takes S on the whole database for each query, a predicate lock whose predicate is every triple. A pattern naming a term the store has never seen matches nothing, and its scan does not run (queries no longer add their constants to the dictionary), so in `phantom-rr` the insert goes through, while in `phantom-ser` the database lock blocks it. The cost is concurrency: one serializable reader stops every writer.

Serializable picks one extra mechanism: key-range locks, gap locks, or predicate locks. Write the choice in the header comment above the code. Under serializable the insert blocks until the reader commits. A predicate lock on `?s rdf:type ub:Student` also blocks a transaction that inserts a course if your predicate is wider than the query. That cost is the reason to write down which predicate you actually locked.

## Transactions

`Begin` returns a growing transaction. Ids increase from 1. `Commit` releases locks and moves to committed. `Abort`, when no log manager was installed, undoes the write set newest-first, releases locks, and moves to aborted. Newest-first matters: an insert followed by a delete of the same triple restores the wrong state if you undo the insert first. A committed or aborted transaction accepts no further work.

`TransactionManager` (plan 7.2, done) undoes before it unlocks, so no other transaction sees a change being taken back. A transaction's state is atomic, because the deadlock detector marks a waiting transaction aborted from its own thread.

With a `LogManager` passed in, abort undoes by the log instead and writes CLRs (plan 8.4, see [WAL and ARIES](recovery.html#abort-and-compensation)). Null means write-set undo, which is what the shell's backends use.

::: today
`\begin`, `\commit`, `\abort`, `\txns` (one line per transaction), and `\locks` (the lock table, with waiters) run. All twelve specs pass on the memory and indexed backends.
:::

::: next
Concurrency is done: plans 7.1 (latch crabbing, see [B+ tree](b-plus-tree.html#crabbing)) through 7.6.
:::

::: read
Gray, Lorie, Putzolu, and Traiger, "Granularity of Locks and Degrees of Consistency in a Shared Data Base". Eswaran et al., "The Notions of Consistency and Predicate Locks".
:::
