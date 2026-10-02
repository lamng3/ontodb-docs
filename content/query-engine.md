---
title: Query engine
slug: query-engine
order: 4
kicker: Execution
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

Patterns join left to right. The filter sits above the joins. `ORDER BY` sits under the projection when it is present. Projection, then distinct, then limit. Insert and delete plans exist so `\explain` can print them. Until plan 4.6 the engine applies `INSERT DATA` and `DELETE DATA` itself, straight to the store.

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
Plan 4.1 reopens the inner scan with the outer row filled in. The test watches the pattern passed to `Scan`, not the output rows, because the rows are already right. Files: `triple_scan_executor.cpp` and `nested_loop_join_executor.cpp`.
:::

Plan 4.2 is the index nested-loop join: the same rebinding, then a prefix probe of a B+ tree instead of a scan. `\set join inlj` selects it. On the memory backend the probe may still be a filtered scan. The rows must match nested loop.

Plan 4.3 is hash join. Build a table on one side, probe with the other. The key is the shared variables, hashed as `term_id_t`. An unbound slot is not a key. `\set join hash` selects it.

## Filter

Equality and inequality are numeric when both sides are numeric datatypes, and term-id identity otherwise. Ordered comparisons are numeric, or lexicographic on the canonical spelling when the kinds match. A type error is false, not an exception. The query continues.

## Projection, distinct, limit, sort

Projection keeps the slots in the `SELECT` clause. `SELECT *` keeps every slot in first-appearance order.

`DISTINCT` is a set of projected rows, not a set of triples. Distinct before projection and distinct after projection answer different queries: two triples can share a name.

`OFFSET` skips, then `LIMIT` counts. The window preserves the child order. A small example used by the tests: objects arriving as 5, 5, 3, 1, 2, with offset 1 and limit 2, yield 5 then 3.

`ORDER BY` compares the way the filter does. Do not sort raw ids. Ids are assigned in intern order, which is not value order. A small run sorts in memory. A run that does not fit sorts externally through the buffer pool, so a spill is a page with a pageLSN, not a private `fwrite`.

::: next
Plans 4.4 and 4.5. The plan nodes already exist in `stub_plans.h`. The factory throws `PLAN 4.4` and `PLAN 4.5` until the executors exist. `\set join inlj` throws 4.2 and `\set join hash` throws 4.3 today, and it does not change the stored setting when the operator is missing.
:::

## Insert and delete executors

A duplicate insert adds nothing and allocates no second id. A delete of a missing triple deletes nothing. When the indexed store exists, write the dictionary first, then every index. If a later index insert fails, the earlier indexes and the dictionary must not show a half-written triple.

That is also why a crash in the middle of a multi-page insert needs the log. The executor's job is the logical update. ARIES's job is to finish it or remove it. See [WAL and ARIES](recovery.html#why-a-split-is-not-undone).

## Pinned frames

The buffer pool exposes the pinned-frame count. After every query, and after every destroyed iterator, that count is zero. A guard left on a leaf fails the harness even when the rows were right.

::: read
Graefe, "Query Evaluation Techniques for Large Databases", the volcano iterator and the three join algorithms.
:::
