---
title: B+ tree
slug: b-plus-tree
part: Internals
order: 5
kicker: Internals
description: Why OntoDB's index is a B+ tree, how pages split and merge, and how a scan holds one leaf.
lede: The triple index is a B+ tree. Keys live in the leaves. Internal pages hold separators and child pointers. Leaves point at their right sibling.
---

A B-tree can store keys in internal nodes. A B+ tree does not. OntoDB uses the B+ tree shape because a SPARQL range is a walk along sibling leaves, and that walk should not climb back to the root for every key.

The key is a `TripleKey`, 24 bytes. The value in a leaf is the key itself: the triple is the record. There is no separate tuple id.

Every page is 4096 bytes. The first 8 bytes are the pageLSN, little-endian. Payload starts at offset 8. A stored LSN of 0 means unset. `INVALID_LSN` is -1.

## Page layout

The byte layout is written in the page headers. After the 8-byte pageLSN, every index page has a 12-byte header: type, size, and max size, each a 4-byte integer in the machine's byte order. A leaf follows with its right sibling's page id and an array of 24-byte keys: 169 per page. An internal page follows with slots of a 24-byte key and a 4-byte child id: 145 slots, so 144 keys. Keys are stored whole, with no prefix compression. The header page keeps the root id just after the pageLSN.

The contracts:

- An internal page stores `n` keys and `n + 1` children. `KeyAt(0)` is unused. `ValueAt(0)` is the leftmost child.
- A leaf stores keys in increasing order and a right-sibling page id.
- `MaxSize()` is at least 2, and the page fits in `PAGE_SIZE`.
- The header page stores the root, or `INVALID_PAGE_ID` when the tree is empty.
- `GetLSN` / `SetLSN` are the page's pageLSN.

A zeroed page is not a valid header until the root is initialized to `INVALID_PAGE_ID`.

::: next
Plans 2.1 to 2.7 are done; `scripts/check index` runs them all. The tree is single-threaded until crabbing (plan 7.1).
:::

## Order

`CheckInvariants` returns nullopt when the tree is well formed, otherwise a description of the first broken rule. Check size, order, sibling links, and the separator rule: keys in child `i - 1` are strictly less than `KeyAt(i)`, and keys in child `i` are greater than or equal to it.

`CheckInvariants` also checks the minimum fill (every node but the root at least half its maximum), that every leaf is at the same depth, and that each key lies in the range its ancestors' separators allow. It reads one page at a time, so it runs on a tiny pool.

`ToString` prints one line per level. `ToDot` is a Graphviz digraph, with dashed edges for sibling links. `\tree spo` and `\tree spo dot` call these once the indexed backend exists (plan 3.4); with the memory backend they answer `no index`.

## Point search

`GetValue` walks from the root to a leaf. An empty tree is empty. A missing key returns false. The pinned-frame count is zero on return. The header page must be created with `Init`, which stores `INVALID_PAGE_ID`; a zeroed header would read as a tree rooted at page 0.

## Insert and split

A duplicate insert returns false. A full leaf splits. A full internal page splits, including the split that creates a new root. Separators stay consistent with the leaves.

Pick copy-up or copy-down and test the parent separator against the leaf. If you copy the middle key up and also leave it in the left leaf, the separator rule fails: the right leaf's first key is not strictly greater than a separator that still sits in the left leaf.

After the pages agree, call:

- `CrashPoint::Reach("BPlusTree::Insert::after_leaf_split")`
- `CrashPoint::Reach("BPlusTree::Insert::after_internal_split")` — a root split counts

Unpin before returning. The random-insert test compares the tree to a sorted `std::vector`.

OntoDB splits in the middle: a leaf keeps the left half and copies the right half's first key up; an internal page moves its middle key up. Pages store no parent pointer. An insert remembers the page ids on its way down, releasing each page before reading its child, and re-fetches a parent by id only if the split reaches it. That keeps at most three pages pinned and is correct while one thread changes the tree.

The constructor takes optional maximum node sizes, defaulting to what a page holds. Tests pass sizes as small as 2 to grow deep trees from few keys; a randomized test checks every invariant after every insert and delete against `std::set`.

## Iterator

`Begin()` walks every leaf through sibling pointers and holds one leaf guard. `Begin(key, prefix_len)` starts at the first key of that prefix and stops at `PrefixUpper`. Destroying the iterator drops the guard. `operator*` on an end iterator is undefined. The default-constructed iterator is the end, and it does not throw.

During a scan the pinned-frame count stays at most 1, and it is 0 after the iterator dies. Drop the current leaf before pinning the sibling. Holding the parent as well deadlocks a 3-frame pool on a tall tree.

This iterator is what `IndexedTripleIterator` wraps, and what a triple scan will pull when the backend is indexed.

## Bulk load

Bulk load is not a loop of `Insert`. The keys arrive sorted and unique. One pass builds full leaves and links them. One pass per level builds the parents. Leaves are filled to their maximum, with no fill factor. If the last node of a level would fall below its minimum, it and its left neighbour split their entries evenly. `CheckInvariants` passes. `GetValue` finds the first and last key. Unsorted input throws `std::invalid_argument`; a tree that is not empty throws `std::logic_error`.

The loader uses this in plan 6.1: intern every term, encode, sort each permutation, then bulk-load. Sorting strings would be the wrong order. The order is the order of the ids.

## Delete

Removing a missing key returns false. Merge or redistribute so every node except the root stays at least half full. OntoDB merges when the two siblings fit in one page and borrows one entry otherwise; an internal merge pulls the separator down between the halves, and an internal borrow rotates through the parent. When the root is left with one child, that child becomes the root; when the last key goes, the tree is empty. The test accepts either crash point:

- `BPlusTree::Remove::after_redistribute`
- `BPlusTree::Remove::after_merge`

Update the parent separator when you redistribute. A stolen key that does not move the separator fails `CheckInvariants`. After a merge, the parent keeps one child page id and the freed page goes back to the disk manager. Forgetting the free leaks pages. Freeing the survivor loses the keys.

## Crabbing

Latches and locks are different. A latch protects the page structure for the duration of a tree operation. A lock protects a triple for a transaction. Crabbing is the latch protocol, and it is plan 7.1, after the single-threaded tree is correct.

Pessimistic crabbing latches the path and holds a parent only while the child might split or merge. Optimistic crabbing latches the leaf and, if the leaf must split, releases it and starts the whole operation over. Restarting only the split races with another thread that split the same leaf. TSan and `CheckInvariants` both catch that.

Concurrent insert, delete, and scan run under the `tsan` preset. Pins are zero after the threads join.

## Splits and the log

A split touches more than one page. Recovery must not undo a split by deleting the key the user inserted. The split is a structural change, redone from the log and not logically undone. The triple insert is a separate logical record. That split is logged as a redo-only nested top action. The details are in [WAL and ARIES](recovery.html#why-a-split-is-not-undone). The crash points above are where a kill is allowed to land inside the multi-page update.

::: read
Petrov, *Database Internals*, chapter 4. Comer, "The Ubiquitous B-Tree". Bayer and Schkolnick, "Concurrency of Operations on B-Trees".
:::
