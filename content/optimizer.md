---
title: Optimizer
slug: optimizer
order: 5
kicker: Planning
description: The optimizer OntoDB will have — statistics, cardinality, join order, join method, and EXPLAIN ANALYZE.
lede: The planner emits one left-deep nested-loop tree. The optimizer rewrites it. That rewriter is part of the database, and it is the optimizer feature.
---

A SPARQL join of four patterns has a factorial number of orders and three algorithms at each edge: nested loop, index nested loop, and hash join. The memory planner always picks the textual order and nested loop. That is a correct plan. It is not the plan you want on LUBM.

`Optimizer::Optimize` takes that tree and returns another tree. The new tree must return the same rows. `Config::join` forces the algorithm when it is not `kAuto`:

- `kNestedLoop` stays a nested loop.
- `kHash` becomes a hash join. The plan text contains `HashJoin`.
- `kIndexNestedLoop` becomes an index nested-loop join.
- `kAuto` may pick any of the three.

The factory already builds the executor from the node type. Slice 5.4 swaps the node. It does not teach the executor to ignore its own type.

::: today
`Optimize` throws `PLAN 5.3`. `\explain analyze` throws `PLAN 5.5`. Statistics and the cardinality estimator throw their own plan ids. The shell setting `\set join auto|nlj|inlj|hash` is stored either way.
:::

::: next
`scripts/check optimizer` covers slices 5.1 through 5.5, in that order. Join-method selection also depends on the executors from 4.2 and 4.3. You can collect statistics as soon as a store and a dictionary exist.
:::

## Statistics

`Collect` runs at load. Four numbers are the contract, and you may add more:

- `TripleCount`
- `DistinctCount("s"|"p"|"o")`
- `PredicateCount`, how many triples use a given predicate id
- `PatternCount`, how many triples match a partially bound pattern

`PatternCount` may scan. It does not have to be clever. The estimator is what has to be cheap, because planning calls it on every alternative.

## Cardinality

Estimates are finite and never negative. A pattern with nothing bound estimates `TripleCount`. Binding one more position never increases the estimate.

The usual formula treats positions as independent. Two bound positions estimate `|p| * |o| / |T|`. Check that against `PatternCount` on a few real patterns and write down the worst q-error, which is the ratio of estimate to truth, taking the worse direction.

A fully unbound pattern joined with itself is not `TripleCount` for the join result. The second copy is correlated through the shared variables. An estimate that ignores the correlation will look precise and still pick a bad order.

## Join order

Start greedy and left-deep. Enumerate bushy plans only after left-deep works. The test checks rows, not which order you picked. Your own timing experiment is what checks the order.

Selinger's search keeps, for each subset of patterns, the cheapest way to produce it, plus interesting orders if you later add sort. OntoDB's first version can ignore interesting orders and keep one winner per subset. `ORDER BY` is an operator above the joins, not a reason to preserve a permutation's order, until you decide that a range scan is already sorted.

## Join method

Cost the three algorithms with the cardinalities you just estimated.

- Nested loop is `|outer| * |inner|` in the worst pattern, and it needs no memory.
- Index nested loop is `|outer|` prefix probes. It wins when the inner pattern becomes a short range once the outer row is bound, which is the common SPARQL case: the outer row names a subject, and SPO is a point or a short range.
- Hash join is linear in the two inputs and needs memory for the build side. It loses when the build side is the whole store, when the key is almost unique so the index was already a point lookup, and when you cannot afford the table.

Forcing `kHash` belongs in the optimizer because the executor must not secretly become a hash join while the explained plan still says nested loop.

## Explain analyze

`\explain analyze` prints an estimated count and an actual count for each node. The actual count is how many times `Next` returned a row. Run the plan, count, then print. Do not estimate the actual.

When the estimate says 10 and the node returned 10,000, look at that node first. The missing statistic is usually a correlation `PatternCount` would have seen and the independence formula averaged away.

::: read
Selinger et al., "Access Path Selection in a Relational Database Management System". Neumann and Weikum, RDF-3X, the selectivity section.
:::
