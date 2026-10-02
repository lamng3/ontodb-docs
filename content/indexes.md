---
title: Triple indexes
slug: indexes
order: 7
kicker: Storage
description: The 24-byte triple key, prefix bounds, and why ontodb builds SPO, POS, and OSP rather than all six.
lede: A triple index is a B+ tree of 24-byte keys. Each permutation is the same triples in a different order, so a different pattern is a range.
---

`TripleKey` is 24 bytes: subject, predicate, object, each a big-endian `uint64`. Order is `memcmp` on those bytes. `sizeof(TripleKey)` is 24. There is no padding to lean on.

## The 24-byte key

Big-endian is what makes integer order and byte order the same. Little-endian would sort 256 before 1, and a prefix scan would be wrong even if `Compare` special-cased it. `Encode(0x0102, 0, 0)` stores `0x01` at byte 6 and `0x02` at byte 7.

`PrefixLower(key, n)` is the smallest key whose first `n` components equal `key`'s. `PrefixUpper(key, n)` is the smallest key strictly above every key with that prefix. A scan of `[lower, upper)` is exactly the prefix. `n` is 0, 1, 2, or 3.

For the key `(5, 7, 9)`:

| n | Lower | Upper |
| --- | --- | --- |
| 0 | `(0, 0, 0)` | past every key |
| 1 | `(5, 0, 0)` | `(6, 0, 0)` |
| 2 | `(5, 7, 0)` | `(5, 8, 0)` |
| 3 | `(5, 7, 9)` | `(5, 7, 10)` |

`n = 3` is a point lookup. `n = 1` on SPO is "every triple with this subject".

::: next
This is plan 0.2, and it is the next item to build. `scripts/check 0.2`. The tests are `DISABLED_RoundTripAndBigEndian` and `DISABLED_PrefixBounds`. Encode, decode, compare, and both prefix bounds throw until you fill them in.
:::

## Permutations

One order cannot serve every pattern. SPO answers a bound subject. It does not answer a bound object with an unbound subject, except by scanning the whole tree and filtering.

The catalog names three roots: `"spo"`, `"pos"`, and `"osp"`. Hexastore would build all six. RDF-3X argues you can stop earlier. Plan 3.5 makes you measure before you choose.

| Pattern | A prefix of |
| --- | --- |
| subject bound | SPO |
| subject and predicate | SPO |
| predicate bound | POS |
| predicate and object | POS |
| object bound | OSP |
| object and subject | OSP, or a filter on SPO if you accept the scan |
| all bound | any, as a point lookup |
| nothing bound | a full scan of any permutation |

All eight bound/unbound patterns must return the right triples even when only SPO exists. The extra permutations change the cost, not the answer. "All six" is the wrong default: each extra tree costs pages, and two or three cover the patterns that show up in real SPARQL.

## Indexed store

`Insert` returns false if the triple is present. `Delete` returns false if it is absent. Either call updates every index the catalog has a root for, or it leaves the store unchanged. A scan returns `IndexedTripleIterator`, which drops its leaf guard when it dies.

With only SPO, a pattern that is not a prefix of SPO is a scan plus a filter. `\set backend indexed` switches the shell to this store. Today that command throws `PLAN 3.4` and does not change the setting.

The differential test builds a disk stack per query file. While `DiskManager` throws, the test skips and CI stays green. When the stack exists, it runs every query on memory and on the index and diffs the decoded rows, then asserts zero pinned frames.

## Catalog

The catalog remembers the root page id of each permutation and of the dictionary. A missing name returns `INVALID_PAGE_ID`. `Flush` makes the metadata durable. A later process on the same file sees the values.

Page 0 is a reasonable home. Initialize it before the first read. Page 0 is a legal page id, so a zeroed "root" must not be mistaken for an empty tree that lives on page 0. The empty tree stores `INVALID_PAGE_ID`.

::: next
After the B+ tree can insert and scan, plan 3.4 is the indexed store with SPO only. Plan 3.5 is the measurement that decides POS and OSP. Plan 3.6 is a clean shutdown: flush the pool and the catalog, close the file, open it, and see the triples.
:::

::: read
Weiss, Karras, and Bernstein, Hexastore. Neumann and Weikum, RDF-3X, the permutation section.
:::
