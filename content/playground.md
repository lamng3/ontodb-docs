---
title: Playground
slug: playground
part: Getting started
order: 3
kicker: Try it
description: Run SPARQL over the Pizza ontology or your own Turtle in the browser, with the store saved locally.
lede: Run SPARQL queries and updates in your browser, over the Pizza ontology or your own Turtle, with the data saved in this browser between visits.
---

:::warning
This playground runs **Oxigraph**, a SPARQL engine compiled to WebAssembly, not OntoDB itself. OntoDB is a C++ engine and is not built for the web yet. Answers should agree on the SPARQL both support; the query plans shown here are OntoDB's own, recorded from its shell. For the real engine, see [Install and run](install.html) and the [SPARQL reference](sparql.html).
:::

<div id="playground" aria-label="SPARQL playground">Loading the playground…</div>
<script src="pg.js"></script>
<script src="playground.js"></script>

## What it keeps

The store lives in your browser's IndexedDB under this manual, one per dataset. Updates (`INSERT DATA`, `DELETE DATA`, and the rest of SPARQL Update) are saved as you run them, so reloading the page keeps your changes. Reset this store returns the dataset to its starting point, and clearing site data removes everything. Nothing is sent to a server.

## What is different from OntoDB

- **Engine.** Oxigraph implements the whole of SPARQL 1.1. OntoDB answers a subset, listed in the [SPARQL reference](sparql.html), so a query that works here can still be refused by OntoDB.
- **Plans.** Oxigraph does not print OntoDB's plans. The plan panel shows the recorded plans for the four Pizza queries that came from the real shell; for any other query run `\explain analyze` there.
- **Durability.** OntoDB logs every transaction before applying it and recovers with ARIES. Here, the whole store is written to IndexedDB after each update, which is neither atomic across tabs nor a write-ahead log.
