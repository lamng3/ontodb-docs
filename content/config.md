---
title: Settings
slug: config
part: Using OntoDB
order: 5
kicker: Using OntoDB
description: Shell settings changed with \set, timing, and the statistics counters.
lede: \set prints the settings and \set knob value changes one. Settings last for the shell process.
---

## Settings

```text
OntoDB> \set
backend mem
pool_size 64
lru_k 2
join nlj
isolation rc
```

| Knob | Values | Default | Effect today |
| --- | --- | --- | --- |
| `backend` | `mem`, `indexed` | `mem` | `indexed` answers `not built yet` (PLAN 3.4) and is not stored |
| `pool_size` | frames | `64` | Stored for the buffer pool, which is being built |
| `lru_k` | positive integer | `2` | Stored for the buffer pool's LRU-K eviction, which is being built |
| `join` | `auto`, `nlj`, `inlj`, `hash` | `nlj` | Join operator. `inlj` and `hash` answer `not built yet` (PLAN 4.2, 4.3) when a query runs |
| `isolation` | `ru`, `rc`, `rr`, `ser` | `rc` | Stored for transactions, which are being built |

A setting that is accepted prints `ok`. An unknown knob or value prints an error and changes nothing.

## Timing

`\timing on` prints `time: N ms` after each statement's result. `\timing off` stops it.

## Statistics

```text
OntoDB> \stats
page reads: 0
page writes: 0
buffer hits: 0
buffer misses: 0
log flushes: 0
```

`log flushes` counts physical log writes in a persistent database; one flush can carry many commits. The page and buffer counters stay at zero until the buffer pool exists.
