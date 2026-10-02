---
title: Benchmarks and writeups
slug: research
order: 14
kicker: Research
description: How a comparison of eviction, indexing, joins, or recovery becomes a result table and a writeup.
lede: One engine, several methods. A method is a knob. The result table is what a writeup is allowed to cite.
---

The store stays one codebase. Eviction, which permutations exist, which join runs, and how often a checkpoint is taken are switches. Record the switch in the result table. Do not fork the repository to try a method.

A comparison waits until the feature it measures exists. The directory is created then, not before.

## A question

```text
benchmarks/<question>/
  question.md    what is compared, on which data, and which metric decides
  run.sh         the commands, with the dataset and the knobs
  results.md     the table a writeup will cite
  raw/           logs and traces; this directory is not committed
```

| Directory | Question | Waits on |
| --- | --- | --- |
| `eviction` | How do pool size and LRU-K change the hit ratio on one query mix? | [Buffer pool](buffer-pool.html) |
| `indexing` | Which permutations pay for themselves on LUBM? | [Triple indexes](indexes.html), bulk load |
| `joins` | Nested loop, index nested loop, hash, and the optimizer's own choice | [Query engine](query-engine.html), [optimizer](optimizer.html) |
| `recovery` | Group commit and checkpoint interval against throughput and restart time | [WAL and ARIES](recovery.html) |

`scripts/fetch-data lubm` builds the LUBM(1) file for the indexing and join questions. It needs Java. `data/tiny.ttl` is the smoke graph, 53 triples, not a benchmark.

`question.md` names the metric before the run. Hit ratio, pages read, load time, commit latency, and restart time are the ones these four questions can answer. A second metric can sit in the same table. It does not replace the one that decides.

`run.sh` prints the knob values it used. A result with no knob is not comparable to the next run.

## A writeup

A writeup is one file in `writeups/`, written after `results.md` exists. The first paragraph states the method, the data, and the metric. It links the result table. Figures may be drawn from `raw/`. The logs stay there and are not pasted into the writeup.

The shape that stays readable later:

1. The question, in one sentence.
2. The methods, including the knob values.
3. The data set and the query mix.
4. The table from `results.md`.
5. What the table does not show. A hit-ratio win with a slower load is still a result. Write it down.

There is nothing to write up yet. The memory shell is the baseline those tables will be compared with, once the indexed store and the log exist.

## The query window

The shell is the interface. A later window, desktop or local page, sends the same text and prints the same rows. It does not get a second parser, a second planner, or its own notion of a result. Benchmarks keep using the shell and `run.sh`, so a UI change cannot move a number.

::: today
`benchmarks/README.md` and `writeups/README.md` are the contract. No question directory has a `results.md` yet.
:::

::: next
The next code is still the [triple key](indexes.html#the-24-byte-key). The first comparison that can be run after that is eviction, and only once the [buffer pool](buffer-pool.html) reports hits and misses.
:::
