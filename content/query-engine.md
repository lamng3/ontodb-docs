---
title: Query engine
slug: query-engine
part: Internals
order: 1
kicker: Internals
description: How a SPARQL plan runs as a volcano tree of scans, joins, filters, and projections over term ids.
lede: The engine is volcano. Each operator implements Init and Next, and a row is a vector of term ids.
---

The planner does not run the query. It builds a tree. The execution engine asks a factory for the matching executor tree and pulls rows until `Next` returns false.

```text
Projection
  Filter          age > 21
    NestedLoopJoin
      TripleScan   ?s a ub:Student
      TripleScan   ?s ub:name ?name
      TripleScan   ?s ub:age ?age
```

Patterns join left to right. The filter sits above the joins. `ORDER BY` sits under the projection when it is present. Projection, then distinct, then limit. `INSERT DATA` and `DELETE DATA` plan to one insert or delete node, which runs as `ModifyExecutor` (plan 4.6): it writes each triple to the store, which writes every index or none, and returns the number changed as its one row. If a later write throws, it takes back the triples the statement already changed, so a statement is atomic on both backends even without a log.

## Triple scan

`TripleScanExecutor` calls `TripleStore::Scan(pattern)` and gets a `TripleIterator`. Bound positions must match. If the same variable occurs twice inside one pattern, the scan keeps a triple only when those positions are equal.

An empty pattern is one empty row, not zero rows. That is the identity input for a join that has nothing to bind yet.

::: today
The scan runs against `MemStore`. The iterator is a snapshot of the matching triples. Destroying it does not unpin anything, because the memory store has no pages.
:::

## Nested-loop join

The join merges two rows by slot. Where both sides have a real id, the ids must be equal. Where one side is unbound, the other's id wins. The output width is the query's slot count, not the sum of the two children.

The current join full-scans the inner child for every outer row. It does not push the outer binding into the inner pattern. The result is still correct, because the merge rejects pairs whose shared slots disagree. The cost is a full inner scan even when the outer row has already named the subject.

::: next
Plan 4.1, done: the nested loop reopens its inner side with `InitWith(outer row)`. Every executor has `InitWith`, which by default is `Init`; the triple scan overrides it and turns each variable the outer row binds into a constant in the pattern it hands the store. On the indexed backend that pattern is usually a subject prefix, so each inner scan is a short range instead of a scan of every triple with that predicate. The test watches the pattern passed to `Scan`, not the output rows, because the rows were already right. Files: `triple_scan_executor.cpp` and `nested_loop_join_executor.cpp`.
:::

Plan 4.2, done: the index nested-loop join. Its inner side must be one triple pattern, and it has no inner executor: for each outer row it fills the pattern from that row and asks the store, which picks the index whose order starts with the bound positions. With rebinding the nested loop reads the same triples; the separate operator skips the inner executor and the generic merge, and names the strategy in the plan. `\set join inlj` selects it; a join whose inner side is not a scan stays a nested loop. On the memory backend the probe is a filtered scan.

Plan 4.3, done: hash join. It reads the inner (right) side once into a table keyed by the ids of the variables both sides produce, then streams the outer side through it. A row whose key slot is unbound is not hashed; it is compared with every row of the other side. With no shared variable the key is empty and the join is a cross product. Building on the inner side is a stand-in until the optimizer can pick the smaller side. `\set join hash` selects it.

`\set join` is applied by `Optimizer::ApplyJoinMethod`, which swaps the plan's join nodes before the plan is explained or run, so `\explain` shows the operator that runs. The differential test runs every query file under all three joins.

## Filter

Equality and inequality are numeric when both sides are numeric datatypes, and term-id identity otherwise. Ordered comparisons are numeric, or lexicographic on the canonical spelling when the kinds match. A type error is false, not an exception. The query continues.

## Projection, distinct, limit, sort

Projection keeps the slots in the `SELECT` clause. `SELECT *` keeps every slot in first-appearance order.

`DISTINCT` is a set of projected rows, not a set of triples. Distinct before projection and distinct after projection answer different queries: two triples can share a name.

`OFFSET` skips, then `LIMIT` counts. The window preserves the child order. A small example used by the tests: objects arriving as 5, 5, 3, 1, 2, with offset 1 and limit 2, yield 5 then 3.

`ORDER BY` compares the way the filter does. Do not sort raw ids. Ids are assigned in intern order, which is not value order. A small run sorts in memory. A run that does not fit sorts externally through the buffer pool, so a spill is a page with a pageLSN, not a private `fwrite`.

::: next
Plan 4.4, done: `DISTINCT` passes each projected row the first time it appears, in its child's order, and keeps a hash set of what it has passed, so its memory grows with the number of distinct rows. `LIMIT` skips the offset, then stops pulling from its child once it has passed the limit. Without `ORDER BY` the engine promises no order: the memory store yields triples in insertion order and the indexed store in key order, so `LIMIT` alone may pick different rows on the two backends, and both are correct. Plan 4.5, done: sort. Keys compare by value with `TermOrder`, a total order: unbound, then blank nodes, then IRIs, then literals; numeric literals first among literals, by value; other literals by lexical form, datatype, and language; any remaining tie by id. Equal keys keep their input order. On the indexed backend a sort may use half the buffer pool (at least four pages). Input that fits is sorted in memory; larger input is cut into sorted runs written to pool pages, merged up to budget minus two at a time, and the last merge streams to the operator above. Run pages are freed as they are read, and the rest when the sort is destroyed, for example under a `LIMIT`. Spilled pages take new page ids, and the file never reuses ids, so an external sort leaves the file larger. On the memory backend there is no pool, and every sort is in memory. `\set join inlj` and `\set join hash` run (plans 4.2 and 4.3).
:::

## Insert and delete executors

A duplicate insert adds nothing and allocates no second id. A delete of a missing triple deletes nothing. When the indexed store exists, write the dictionary first, then every index. If a later index insert fails, the earlier indexes and the dictionary must not show a half-written triple.

That is also why a crash in the middle of a multi-page insert needs the log. The executor's job is the logical update. ARIES's job is to finish it or remove it. See [WAL and ARIES](recovery.html#why-a-split-is-not-undone).

## Pinned frames

The buffer pool exposes the pinned-frame count. After every query, and after every destroyed iterator, that count is zero. A guard left on a leaf fails the harness even when the rows were right.

::: read
Graefe, "Query Evaluation Techniques for Large Databases", the volcano iterator and the three join algorithms.
:::
