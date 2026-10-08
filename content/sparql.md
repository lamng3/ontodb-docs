---
title: SPARQL
slug: sparql
order: 3
kicker: Language
description: The SPARQL subset OntoDB parses, how variables become slots, and which features fail with a line and column.
lede: OntoDB speaks SPARQL, not SQL. The supported language is a basic graph pattern plus filters and ground updates.
---

A triple is subject, predicate, object. A query names some of those positions with variables and asks for the bindings. There is no table of rows until the engine builds one.

```sparql
PREFIX ub: <http://example.edu/univ#>
SELECT ?name WHERE {
  ?s a ub:Student ; ub:name ?name ; ub:age ?age .
  FILTER (?age > "21"^^xsd:integer)
}
```

`a` is `rdf:type`, and only the lowercase verb. `;` repeats the subject. `,` repeats the subject and the predicate. A dot ends a triple. A dot inside `http://www.Department0.University0.edu/...` stays inside the IRI.

## What the parser accepts

- `PREFIX` declarations. Prefixed names are stored until the binder joins them to the IRI.
- `SELECT` of named variables or `*`. `SELECT *` projects every variable in first-appearance order.
- A basic graph pattern in one group. Nested groups are an error.
- `FILTER` comparisons `= != < > <= >=`, combined with `&&`.
- `DISTINCT`, `LIMIT`, `OFFSET`, `ORDER BY`. The parser and the planner accept them. Execution of those operators is still plan 4.4 and 4.5.
- `INSERT DATA` and `DELETE DATA` with ground triples. Constants are interned on insert and only looked up on delete.

Numbers in the query become `xsd:integer` or `xsd:decimal` literals. The one spelling shared by the loader and the binder is: `<iri>`, `"lex"`, `"lex"@en`, `"lex"^^<datatype>`.

## What fails on purpose

`OPTIONAL`, `UNION`, property paths, aggregates, and `DELETE/INSERT WHERE` raise `ParseException` with a line and a column. The message names the feature. That boundary stays until you choose to extend the language. Do not half-implement `UNION` inside the basic-graph-pattern parser.

Blank nodes, language tags, and datatype IRIs are terms, not syntax errors.

## Variables are slots

The binder walks the query once and assigns each variable a column in the order it first appears. A row is a `vector` of `term_id_t`. The same variable in two triple patterns is the same slot. That is the join key. It is also why a later index nested-loop join can fill the inner pattern from the outer row without inventing a second naming scheme.

`INVALID_TERM_ID` means unbound. A filter that sees it does not invent a match.

## No reasoner

OWL files load as RDF triples. `subClassOf` is data, not a rule. LUBM queries 4, 5, 6, and 11–13 ask for a class and the data stores a subclass. Those queries return a subset. That is the store being honest. Materializing `subClassOf` is an open design with no stub, not part of the scan. The comparison, if you build it, is a [writeup](research.html) after the results exist.

::: today
`data/tiny.ttl` is 53 triples. The shell and the query harness run the read subset and the ground updates against `MemStore`.
:::

::: next
The language front end is not the next build. The next build is the key those bound ids will be packed into. See [Triple indexes](indexes.html).
:::

::: read
SPARQL 1.1 Query Language, the sections on basic graph patterns, `FILTER`, and `INSERT DATA` / `DELETE DATA`.
:::
