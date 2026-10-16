---
title: Optimizer
slug: optimizer
part: Internals
order: 2
kicker: Internals
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
The optimizer is complete: statistics (5.1), cardinality (5.2), join order (5.3), the automatic choice of join (5.4), and `\explain analyze` (5.5).
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

OntoDB's `Collect` (plan 5.1, done) scans the store once and keeps counts per subject, predicate, and object, per pair of positions, and the set of triples. Every `PatternCount` is then an exact hash lookup, for every combination of bound positions; pair counts alone cannot answer a fully bound pattern, because all three pairs of a triple that is not stored can each occur elsewhere. That costs about seven hash entries per triple. The counts are a snapshot: updates after `Collect` leave them stale until the next collection.

## Cardinality

Estimates are finite and never negative. A pattern with nothing bound estimates `TripleCount`. Binding one more position never increases the estimate.

The usual formula treats positions as independent. Two bound positions estimate `|p| * |o| / |T|`. Check that against `PatternCount` on a few real patterns and write down the worst q-error, which is the ratio of estimate to truth, taking the worse direction.

OntoDB's estimator (plan 5.2, done) needs no formula for a single pattern: its estimate is the exact `PatternCount` of its constants, and 0 if a constant is not in the dictionary. Joins follow System R: `|L| * |R| / max(V(L, x), V(R, x))` for each shared variable `x`, where `V` is the number of distinct values `x` takes. For one pattern, `V` comes from per-predicate distinct subject and object counts that `Collect` also keeps. On 100 students taking 3 of 10 courses, that is exact for both the star join of students with their names (100) and the join of enrolments with the course class (300); assuming every join value distinct (`min(|L|, |R|)`) would say 10 for the second. `EstimateJoin(l, r, k)` is that simpler fallback, for callers that know no `V`.

A fully unbound pattern joined with itself is not `TripleCount` for the join result. The second copy is correlated through the shared variables. An estimate that ignores the correlation will look precise and still pick a bad order.

## Join order

Start greedy and left-deep. Enumerate bushy plans only after left-deep works. The test checks rows, not which order you picked. Your own timing experiment is what checks the order.

OntoDB's order (plan 5.3, done): flatten the nested-loop chain into its patterns; start from the one with the fewest estimated rows; at each step add the remaining pattern connected to what is joined (sharing a variable) whose join is estimated smallest; take a cross product only when nothing is connected; keep the written order on ties. Estimates carry each variable's distinct-value count down the chain. The engine optimizes whenever it has statistics. The database collects them on the first query after a load or a backend switch, shares one snapshot between sessions, and does not refresh it after updates. `\explain` shows the reordered plan: `?s ?p ?o . ?s a ub:Professor` starts from the Professor pattern.

Selinger's search keeps, for each subset of patterns, the cheapest way to produce it, plus interesting orders if you later add sort. OntoDB's first version can ignore interesting orders and keep one winner per subset. `ORDER BY` is an operator above the joins, not a reason to preserve a permutation's order, until you decide that a range scan is already sorted.

## Join method

Cost the three algorithms with the cardinalities you just estimated.

- Nested loop is `|outer| * |inner|` in the worst pattern, and it needs no memory.
- Index nested loop is `|outer|` prefix probes. It wins when the inner pattern becomes a short range once the outer row is bound, which is the common SPARQL case: the outer row names a subject, and SPO is a point or a short range.
- Hash join is linear in the two inputs and needs memory for the build side. It loses when the build side is the whole store, when the key is almost unique so the index was already a point lookup, and when you cannot afford the table.

Forcing `kHash` belongs in the optimizer because the executor must not secretly become a hash join while the explained plan still says nested loop.

OntoDB's `auto` (plan 5.4, done, and the default) decides per join of the reordered chain: a cross product stays a nested loop; otherwise an index nested-loop join when the estimated outer side is no larger than the inner pattern, and a hash join built on the smaller inner pattern when it is larger. `benchmarks/joins/results.md` runs the 14 LUBM queries under five settings: LUBM's query 2, in its written order, starts with three unconnected type patterns and does not finish in 20 seconds; reordered, it takes 0.1 ms, and `auto` matches the best forced operator on every query. The benchmark stops runaway plans with an executor deadline that every scan checks.

## Explain analyze

`\explain analyze` prints an estimated count and an actual count for each node. The actual count is how many times `Next` returned a row. Run the plan, count, then print. Do not estimate the actual.

OntoDB's (plan 5.5, done) wraps every executor in a counter, runs the query to the end, and prints each node as `Label  (estimated E, actual A)`, then the execution time. The estimates are the optimizer's own; a filter is assumed to keep a third of its input. The inner scan of an index nested-loop join prints `probed by the join above`, because the join asks the store directly and the scan never runs. Updates are planned but not run.

When the estimate says 10 and the node returned 10,000, look at that node first. The missing statistic is usually a correlation `PatternCount` would have seen and the independence formula averaged away.

::: read
Selinger et al., "Access Path Selection in a Relational Database Management System". Neumann and Weikum, RDF-3X, the selectivity section.
:::
