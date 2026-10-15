---
title: Development
slug: development
part: Project
order: 1
kicker: Project
description: How OntoDB is built, tested, and checked feature by feature, and the harnesses behind the tests.
lede: Work is organized as features made of numbered slices. A slice is done when its tests pass with the DISABLED_ prefix removed.
---

## The plan

`PLAN.md` in the repository is the feature list. Each feature is a group of slices with ids such as `1.4` or `8.6`. The ids appear in test names (`P8_6_...`) and in the shell's `not built yet (PLAN x.y)` messages. A test for an unbuilt slice is disabled; removing `DISABLED_` is part of finishing the slice.

## Checks

```text
scripts/check durable        # one feature: build, run its tests, print the next slice
scripts/check 0.2            # one slice
scripts/status               # every slice, grouped by feature, and the progress
scripts/crashtest --seeds 4  # the crash harness
```

`scripts/check` configures and builds the right preset, runs the matching tests (including disabled ones, so you see what is left), and prints pass or fail and the next slice. Concurrency slices run under ThreadSanitizer.

## Continuous integration

Every push builds and runs the whole test suite under AddressSanitizer and UndefinedBehaviorSanitizer, and again under ThreadSanitizer, then checks formatting with clang-format and lints `src/` and `tools/` with clang-tidy, warnings as errors.

## Test harnesses

| Harness | What it checks |
| --- | --- |
| Query harness (`test/queries/*.test`) | SPARQL text and expected rows in canonical spelling, compared as a multiset unless order is declared |
| Isolation harness (`test/isolation/specs/`) | A scripted schedule over two sessions, checking `blocked`, `unblocks`, `abort`, `contains`, `equals`, `absent` |
| Crash harness (`scripts/crashtest`) | Kills a child process at random points and compares the reopened store with a store that replayed only acknowledged commits |
| Durability scenarios (`test/durable/`) | Load, update, crash before commit, crash during checkpoint, torn and corrupt logs, corrupt snapshot, verify, and a full shell session |

Crash points are named `Class::Method::point` and are armed by tests through `CrashPoint::Arm`.

## Code layout

```text
src/include/   headers, one directory per component
src/           implementations, mirroring the headers
tools/shell/   the ontodb shell
test/          GoogleTest suites, mirroring src/
data/          sample ontologies and LUBM queries
scripts/       check, status, crashtest, fetch-data
benchmarks/    one directory per measured question
writeups/      one file per finding
```
