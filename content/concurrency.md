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

- Read uncommitted takes no shared locks. A dirty read is allowed.
- Read committed releases shared locks at the end of the statement. A value you read can change before you commit. You do not see uncommitted writes.
- Repeatable read holds shared locks until commit. A row you read stays. A row you did not read can appear.
- Serializable holds shared locks until commit and adds the phantom mechanism from plan 7.6.

The mechanism is locks, not snapshots. MVCC is an open design with no stub. It is not a substitute you slip into the concurrency feature. A versioned reader is described with [snapshots](durability.html#what-a-snapshot-is-here).

## Deadlock

A background thread wakes every 20 ms, builds the waits-for graph (an edge from each waiting request to every transaction holding an incompatible lock, or waiting ahead of it), and aborts the youngest transaction in each cycle. Younger means the larger id. The abort throws `TransactionAbortException` out of that transaction's `Lock` call. Aborting whoever happened to notice the cycle fails the spec: session 1 starts first, so it has the smaller id, and session 2 is the victim in both the two-key cycle and the upgrade cycle.

## Phantoms

Repeatable read holds locks on triples you read. An insert of a new triple does not conflict with those locks, so a second scan can see Dana even though the first scan did not. The repeatable-read spec expects that. Do not "fix" it by taking a predicate lock at every isolation level.

Serializable picks one extra mechanism: key-range locks, gap locks, or predicate locks. Write the choice in the header comment above the code. Under serializable the insert blocks until the reader commits. A predicate lock on `?s rdf:type ub:Student` also blocks a transaction that inserts a course if your predicate is wider than the query. That cost is the reason to write down which predicate you actually locked.

## Transactions

`Begin` returns a growing transaction. Ids increase from 1. `Commit` releases locks and moves to committed. `Abort`, when no log manager was installed, undoes the write set newest-first, releases locks, and moves to aborted. Newest-first matters: an insert followed by a delete of the same triple restores the wrong state if you undo the insert first. A committed or aborted transaction accepts no further work.

`TransactionManager` (plan 7.2, done) undoes before it unlocks, so no other transaction sees a change being taken back. A transaction's state is atomic, because the deadlock detector marks a waiting transaction aborted from its own thread.

The write set is temporary. Plan 8.4 replaces it with log undo when a `LogManager` was passed in. The constructor already takes that pointer so the signature does not change later. Null means write-set undo.

::: today
`\begin`, `\commit`, `\abort`, `\txns`, and `\locks` print `not built yet`. The isolation harness has a self-test that passes without a lock manager: a driver that fails to block is reported, and a scripted driver that blocks is accepted. The real specs are disabled under plans 7.4, 7.5, and 7.6.
:::

::: next
Plans 7.1 (latch crabbing, see [B+ tree](b-plus-tree.html#crabbing)), 7.2 (transactions), and 7.3 (the lock manager and deadlock detector) are done. Next: 7.4 isolation through the shell, 7.5 deadlocks between sessions, 7.6 phantoms.
:::

::: read
Gray, Lorie, Putzolu, and Traiger, "Granularity of Locks and Degrees of Consistency in a Shared Data Base". Eswaran et al., "The Notions of Consistency and Predicate Locks".
:::
