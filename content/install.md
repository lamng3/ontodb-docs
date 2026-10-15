---
title: Installation
slug: install
part: Getting started
order: 2
kicker: Getting started
description: Install the prerequisites, build OntoDB with CMake presets, and run the test suite.
lede: OntoDB is C++20 built with CMake and Ninja. It needs raptor2 to parse RDF and downloads GoogleTest at configure time.
---

## Prerequisites

| Tool | Version |
| --- | --- |
| A C++20 compiler | Clang 14 or newer |
| CMake | 3.21 or newer |
| Ninja | any recent version |
| raptor2 | 2.0 (RDF parsing) |
| pkg-config | any |

macOS (Homebrew):

```text
brew install pkgconf raptor cmake ninja
```

Ubuntu:

```text
sudo apt-get update
sudo apt-get install -y clang cmake ninja-build pkg-config libraptor2-dev
```

## Build

```text
git clone https://github.com/lamng3/OntoDB.git
cd OntoDB
cmake --preset dev && cmake --build --preset dev
```

This produces two programs in `build/dev/`: `ontodb`, the shell, and `ontodb_test`, the test suite.

| Preset | Build | Use it for |
| --- | --- | --- |
| `dev` | Debug with AddressSanitizer and UndefinedBehaviorSanitizer | Everyday work |
| `tsan` | Debug with ThreadSanitizer | Anything concurrent |
| `release` | Optimized | Benchmarks |

## Check the build

```text
./build/dev/ontodb_test
```

Every enabled test should pass. Tests for features that are not built yet are disabled and reported as such; see [Development](development.html).

## Run

```text
./build/dev/ontodb            # an in-memory database that keeps nothing
./build/dev/ontodb mydb       # a persistent database in the directory mydb
./build/dev/ontodb --strict mydb
```

`--strict` refuses to open a database whose log is damaged, instead of recovering the valid part. See [Recovery on open](persistence.html#recovery-on-open).
