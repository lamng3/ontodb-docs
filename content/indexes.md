---
title: Triple indexes
slug: indexes
part: Internals
order: 4
kicker: Internals
description: The 24-byte triple key, prefix bounds, and why OntoDB builds SPO, POS, and OSP rather than all six.
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

When nothing lies above the prefix, `n = 0` or every bound id at the maximum, the upper bound saturates to the all-`0xFF` key. That is three `INVALID_TERM_ID`s, which the dictionary never assigns, so the scan still covers every stored triple. A prefix length outside 0 to 3 throws `std::invalid_argument`.

::: next
Plan 0.2 is done. `scripts/check 0.2` runs the round-trip, ordering, prefix-bound, carry, and saturation tests. The B+ tree is the key's first user.
:::

## Permutations

One order cannot serve every pattern. SPO answers a bound subject. It does not answer a bound object with an unbound subject, except by scanning the whole tree and filtering.

The default store keeps three: `"spo"`, `"pos"`, and `"osp"`. Hexastore would build all six. RDF-3X argues you can stop earlier. OntoDB measured before choosing (plan 3.5): on LUBM(1), about 100,000 triples, with each pattern shape on a cold 64-frame pool, SPO alone reads all 1,131 pages for any pattern that binds the predicate or the object without the subject; POS and OSP cut that to 128 and 25 pages for twice the space (16 MiB against 8). The other three permutations cost 80% more space and made no pattern cheaper. `benchmarks/indexing/results.md` has the full table, and `benchmarks/indexing/run.sh` reruns it after `scripts/fetch-data lubm`.

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

With only SPO, a pattern that is not a prefix of SPO is a scan plus a filter. `\set backend indexed` switches the shell to this store.

The store names each permutation by its key order (`spo`, `pos`, ...) and keeps whichever the catalog lists; a fresh catalog gets the default set. `Insert` and `Delete` change every index that disagrees, not only when the first does, so repeating one after a crash part way through repairs the others; if one throws, the indexes this call changed are put back before the error propagates. `Scan` uses the index with the longest bound prefix and filters the other bound positions. In the shell, `\set backend indexed` builds a pool (`pool_size`, `lru_k`), the catalog, a disk dictionary, and the store in a temporary file, moves every triple across by spelling, and runs statements from several sessions at once under the lock manager; a scan holds no latch between rows. `\set backend mem` moves the triples back and deletes the file. A persistent database (`ontodb <dir>`) stays on the memory backend: page-level recovery runs in the tests, but the shell does not open a page store from a directory yet.

The differential test builds a disk stack per query file. While `DiskManager` throws, the test skips and CI stays green. When the stack exists, it runs every query on memory and on the index and diffs the decoded rows, then asserts zero pinned frames.

## Catalog

The catalog remembers the page id of each permutation and of the dictionary. A missing name returns `INVALID_PAGE_ID`. `Flush` makes the metadata durable. A later process on the same file sees the values.

For an index, the page the catalog names is the tree's header page, not its root: a root moves when it splits or collapses, and the header page absorbs that, so the catalog changes only when an index is created. The catalog is page 0, with a magic number `OCAT`, the dictionary root, and up to 339 named entries of 8-byte names. On first open it finds page 0 all zeros, initializes it, and writes it to the file at once, so no later allocation can hand out page 0. A non-empty page without the magic number throws `StorageException` instead of being overwritten. Plan 3.3 is done; `scripts/check 3.3`.

Page 0 is a reasonable home. Initialize it before the first read. Page 0 is a legal page id, so a zeroed "root" must not be mistaken for an empty tree that lives on page 0. The empty tree stores `INVALID_PAGE_ID`.

::: next
RDF storage is done. Plan 3.4: the differential test runs every query file on the indexed store and on the memory store. Plan 3.5: the measurement above. Plan 3.6: a clean shutdown (flush the pool and the catalog, close the file) and a reopen see the same triples and terms.
:::

::: read
Weiss, Karras, and Bernstein, Hexastore. Neumann and Weikum, RDF-3X, the permutation section.
:::
