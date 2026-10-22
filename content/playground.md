---
title: Playground
slug: playground
part: Getting started
order: 3
kicker: Try it
description: Run OntoDB itself in the browser: SPARQL, the shell's commands, the B+ tree indexes and semantic search, compiled to WebAssembly.
lede: Run OntoDB itself in your browser. The engine is the same C++ code as the native shell, compiled to WebAssembly, so SPARQL, query plans, the B+ tree indexes and the semantic-search commands behave as they do on your machine.
---

<div id="playground" aria-label="OntoDB playground">Loading the playground…</div>
<script src="playground.js"></script>

## What runs

The page loads `ontodb_wasm.wasm` (about 0.9 MB) and talks to it through two functions: one runs a SPARQL statement and returns a table, the other runs a shell command and returns the text the native shell would print. Nothing is sent to a server. Errors, plans and counters are OntoDB's own, including the messages for SPARQL it does not support, such as `OPTIONAL` and property paths.

Try these in order on the **Gene Ontology slice**, which ships with an embedding for every class name:

1. `\hindex build` labels the class hierarchy with intervals.
2. `\under "cell death" 10` lists everything below a class with range scans over those labels.
3. `\similar "apoptotic process" 8` finds the nearest terms by exact scan. Add `under "cell death"` to restrict the search to a class.
4. `\vindex build all` builds IVF and HNSW. Then `using mask-hnsw` forces a strategy.

Choose **Three B+ tree indexes on a buffer pool** under the Store menu and run a query: the line under the result shows how many buffer-pool hits and misses it cost. The chapter on [semantic search](semantic-search.html) explains what each command does.

## What it keeps

Updates (`INSERT DATA`, `DELETE DATA`, and the rest of what OntoDB supports) are journaled in this browser's local storage and replayed the next time you open the page, so your changes survive a reload. Reset this store clears the journal for the current dataset. Indexes you build with `\hindex` and `\vindex` are rebuilt by running the command again.

## What is different from the native shell

- **Threads.** The WebAssembly build is single-threaded. There is one session, no background deadlock detector, and disk requests run inline instead of on a worker thread.
- **Durability.** There is no write-ahead log or recovery here; the store lives in memory and the journal above stands in for persistence. The write-ahead log and ARIES recovery run in the native build; see [WAL and ARIES](recovery.html).
- **Formats.** Turtle and N-Triples load through a small built-in parser, which is checked against the native raptor-based loader on the shipped data. RDF/XML (`.owl`, `.rdf`) needs the native build.
- **Size.** Everything is in browser memory, so this is for small datasets. The vectors are the 834 embeddings in the slice; `\vload` reads the same file format as the native shell.
