---
title: Dictionary
slug: dictionary
order: 6
kicker: Terms
description: How ontodb interns IRIs, literals, and blank nodes to 64-bit ids, in memory and on disk.
lede: The index never compares strings. It compares ids. The dictionary is the only place a spelling lives.
---

`term_id_t` is a `uint64_t`. Ids start at 1. `INVALID_TERM_ID` is the maximum uint64 and means unbound, not a term. Zero is not a valid id, so a zeroed key does not accidentally name the first term you interned.

## One spelling

`term_codec` is the canonical form both the loader and the binder use.

- IRI: `<http://example.edu/univ#Alice>`
- Plain literal: `"Alice"`
- Language-tagged: `"Alice"@en`
- Datatype: `"22"^^<http://www.w3.org/2001/XMLSchema#integer>`
- Blank node: `_:b0`

Escapes are part of the spelling. Two sources that mean the same IRI must intern once. `Insert` of an existing spelling returns the original id.

Numeric datatypes (`xsd:integer`, `xsd:decimal`, `xsd:double`, `xsd:float`) compare by value in filters and in `ORDER BY`. Everything else compares by id for equality, and by the canonical spelling for ordered comparisons of the same kind.

## Memory dictionary

`MemDictionary` is a mutex-guarded map in both directions. It is what the shell uses today. The mutex lets two sessions share the process. It is not isolation. Locks come later.

::: today
Loading `data/tiny.ttl` interns every term and stores 53 triples in `MemStore`. Lookups used to print a result go through this dictionary. Nothing is written to a file.
:::

## Term heap

On disk, the bytes of a spelling live in a slotted page, not in the B+ tree leaf. A leaf key is three ids, 24 bytes, so the fanout stays high. A leaf that stored the IRIs would be a leaf of strings, and a split would copy those strings.

`TermHeap::Insert` returns nullopt when the record does not fit on the page you asked. A record larger than an empty page throws `StorageException`. `Get` is valid only while the page is pinned. `Delete` frees the slot. A later insert may reuse it. `FreeSpace` includes the slot-directory entry, so the test captures free space before the delete and does not compare the page to itself.

The heap chains pages. Its iterator visits every live record once and holds no pin after `operator*` returns.

## Disk dictionary

Both directions survive restart: spelling to id, and id to spelling. Ids stay dense from 1. A hash index from spelling to id, plus the heap from id to bytes, is enough. Do not intern a spelling twice after restart, or one IRI becomes two ids and every join on that IRI breaks.

The catalog remembers the dictionary root next to the permutation roots. `Flush` makes that metadata durable.

::: next
Plan 3.1 is the term heap. Plan 3.2 is the disk dictionary. 3.2 depends on the heap and on the catalog (3.3). The in-memory dictionary stays; the indexed store is what switches.
:::

::: read
RDF-3X, the dictionary section. Petrov, chapter 3, slotted pages.
:::
