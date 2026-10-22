---
title: Semantic search
slug: semantic-search
part: Using OntoDB
order: 6
kicker: Using OntoDB
description: Find what is under a class, and what is close in meaning to a term, with interval labels, vector indexes, and the shell commands that drive them.
lede: Two questions an ontology store is asked. Structure has an exact answer in the data; similarity needs a vector. OntoDB answers the first with a few range scans over interval labels and the second with a vector index, and combines them.
---

A sorted index cannot say what is close in meaning (a bandwidth argument proves no order can), so OntoDB does not try. It labels the class hierarchy so that everything under a class is a few ranges of integers, keeps one embedding per term, and searches the embeddings with an exact scan, an inverted file whose lists are B+ tree ranges, or an HNSW graph. A search can be limited to the terms under a class. The theory is in the book's chapter *Semantic Search* and in `docs/semantic-search.md`; the paper is `paper/ontodb-semantic.pdf`; the measurements are in `benchmarks/semantic/results.md`.

## What you need

An ontology with `rdfs:subClassOf` triples and `rdfs:label` labels, and a vector file with one embedding per term. OntoDB does not run an embedding model. To try the Gene Ontology (38,092 classes) end to end:

```bash
scripts/fetch-data go                                    # go.nt and go.terms.tsv
scripts/embed-terms data/downloads/go/go.terms.tsv data/downloads/go/go.ovec   # 45 s on a CPU
```

`scripts/embed-terms` uses `sentence-transformers` and writes the vector file format below. Any other model works if it writes the same file.

## A session

```text
OntoDB> \load data/downloads/go/go.nt
OntoDB> \hindex build
labelled 38092 classes (38092 after collapsing cycles), 57456 edges, 19367 outside the spanning forest; 76570 intervals, at most 741 per class; 22.9 ms
OntoDB> \vload data/downloads/go/go.ovec
read 38092 vectors of 384 floats, kept 38092, skipped 0 ...
OntoDB> \vindex build hnsw
hnsw: M=16, 5 layers, 16.1 s
OntoDB> \similar "apoptotic process" 3
nearest to <http://purl.obolibrary.org/obo/GO_0006915>  "apoptotic process" [hnsw, 876 us]
  0.867  <http://purl.obolibrary.org/obo/GO_0042981>  "regulation of apoptotic process"
  0.865  <http://purl.obolibrary.org/obo/GO_1902742>  "apoptotic process involved in development"
  0.802  <http://purl.obolibrary.org/obo/GO_0060561>  "apoptotic process involved in morphogenesis"
OntoDB> \similar "apoptotic process" 3 under "cell death"
nearest to ... "apoptotic process", under "cell death" [pre-filter, 279 us]
  0.865  <http://purl.obolibrary.org/obo/GO_1902742>  "apoptotic process involved in development"
  ...
OntoDB> \under "programmed cell death" 3
96 classes at or below "programmed cell death" (4 range scans, 0.012 ms)
  <http://purl.obolibrary.org/obo/GO_0001781>  "neutrophil apoptotic process"
  ...
```

## Commands

| Command | What it does |
| --- | --- |
| `\hindex build [<predicate>]` | Labels the hierarchy of `predicate` (default `rdfs:subClassOf`) from the stored triples and builds the label B+ tree. Rebuild it after the hierarchy changes |
| `\hindex` | Shows what is built |
| `\under <class> [limit]` | The classes at or below `class`, found by one range scan per interval of the class |
| `\vload <file>` | Reads a vector file. A term the dictionary does not know is skipped |
| `\vindex build [ivf\|hnsw\|all]` | Builds the approximate indexes. Without them search is an exact scan |
| `\similar <term> [k] [under <class>] [using <strategy>]` | The `k` (default 10) terms nearest `term` in meaning, optionally only under `class` |

A term is `<iri>`, or the text of its `rdfs:label`, quoted or bare (`"apoptotic process"` or `apoptotic process`). `\similar` searches from the vector of a term that is already stored; a free-text query needs an embedding model in the process, which OntoDB does not link.

Strategies for `using`: `auto` (the default), `pre`, `post-hnsw`, `post-ivf`, `mask-hnsw`, `mask-ivf`. `auto` resolves the class and scores its members exactly when it has at most 4,096 members, and otherwise searches HNSW with a label predicate. On the Gene Ontology exact resolution is the fastest strategy up to about 1,000 members; masked HNSW is fastest above 5,000. The measurements are in [Benchmarks and writeups](research.html) and `benchmarks/semantic/results.md`.

A backend switch (`\set backend ...`) drops the labels, the vectors, and the indexes, because they name terms by the dictionary's ids; load them again.

## The vector file

`OVEC2`: the bytes `OVEC2\n`, a `uint32` dimension, a `uint64` count, then for each term a `uint32` length, the spelling (`<iri>`), and `dimension` little-endian `float32` values, then a CRC-32C of everything before it. `OVEC1` is the same without the checksum (what `scripts/embed-terms` writes). Records name terms by spelling, so a file survives a dictionary that numbers terms differently. Vectors are normalized when read.

## What it is not

It is not a reasoner. Only `rdfs:subClassOf` is read; `subPropertyOf`, `domain`, `range`, and OWL restrictions are not interpreted. Labels are rebuilt, not updated, when the hierarchy changes. The vectors live in memory and the approximate indexes are rebuilt, not updated, when they change. Vector search is single-threaded.
