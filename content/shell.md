---
title: Shell and checks
slug: shell
order: 13
kicker: Using it
description: Shell commands, sessions, the check scripts, and the three harnesses.
lede: The shell is how you load a file and run a query. The check scripts are how you know a feature is done.
---

Commands that start with `\` are one line. A SPARQL query may span lines. It runs when a `{ }` group has opened and closed and strings are closed, so a `PREFIX` line stays pending until the query that uses it is finished. `\quit` leaves even in the middle of a query. A `#` starts a comment, except inside a string or an IRI. That exception matters: `ub:Student` is `<http://example.edu/univ#Student>`, and treating the `#` as a comment swallows the rest of the query.

```text
\load data/tiny.ttl
PREFIX ub: <http://example.edu/univ#>
SELECT ?name WHERE {
  ?s a ub:Student ; ub:name ?name .
}
```

That load reports 53 triples. The rows are `Alice`, `Bob`, and `Cara`.

`\quit`, `\help`, and `\session` run on the main thread. Everything else runs on a session worker. The worker catches a not-implemented plan id, a parse or bind error, a transaction abort, and any other exception, and prints it.

The prompt is printed only when stdin is a terminal.

## Commands

| Command | What it does now |
| --- | --- |
| `\load path` | Loads Turtle, N-Triples, or RDF/XML |
| a SPARQL query or update | Runs the memory engine |
| `\explain` | Prints the plan, does not execute |
| `\explain analyze` | Not built (plan 5.5) |
| `\stats` | Prints I/O counters, which stay zero until you increment them |
| `\timing on` or `off` | Stores the knob |
| `\set backend mem` or `indexed` | `indexed` is not built (plan 3.4) and does not stick |
| `\set pool_size N`, `lru_k`, `join`, `isolation` | Stored. `\set` with no arguments prints them |
| `\bpm`, `\page`, `\trace` | Not built (plan 1.6) |
| `\tree spo`, `pos`, or `osp` | Not built (plan 2.2) |
| `\begin`, `\commit`, `\abort`, `\txns`, `\locks` | Not built (concurrency) |
| `\log`, `\checkpoint`, `\crash` | Not built (recovery) |
| `\session N` | Sends later commands to worker N |
| `\help`, `\quit` | Work |

`\set pool_size 8` prints `ok`. A following `\set` prints `pool_size 8`.

## Data

`data/tiny.ttl` is a small university graph, 53 triples. `data/pizza.ttl` is a small original pizza subset used by the query tests. `scripts/fetch-data pizza` downloads the full ontology into `data/downloads/`, which is not in git. `scripts/fetch-data lubm` needs Java, runs the official generator, and writes `University0_0.owl`. The 14 LUBM queries live in `data/lubm/queries/`. Query 7 in the official text is not a triple; the file here is the repaired form. All 14 parse.

## Checks

```text
scripts/check key
scripts/check concurrency
scripts/status
scripts/crashtest --seeds 4
```

`scripts/check` configures the preset, builds, runs that feature or that slice, and prints pass or fail plus the next id. Concurrency uses TSan. `scripts/status` prints the feature groups. Progress starts at 0%. A finished comparison is written up from [benchmarks and writeups](research.html).

Presets are `dev` (Debug, ASan, UBSan), `tsan`, and `release`.

## Harnesses

The query harness is a text file of SPARQL plus expected rows in canonical spelling. Comparison is a multiset unless the file says the order matters. `ORDER BY` queries stay out of the enabled suite until sort exists.

The isolation harness runs a scripted schedule against two sessions and checks `blocked`, `unblocks`, `abort`, `contains`, `equals`, and `absent`. Its self-test does not need a lock manager.

The crash harness forks a child, kills it, and compares the reopened store to a memory store that replayed only acknowledged commits. Its self-test uses fake stores that lie in known ways.

::: today
`scripts/check shell` passes. It loads tiny and pizza and runs the shell smoke query, including a `PREFIX` on its own line. `scripts/status` shows 0%.
:::

::: next
`scripts/check key` after [TripleKey](indexes.html#the-24-byte-key) encodes, compares, and computes prefix bounds.
:::
