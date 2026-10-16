---
title: SPARQL reference
slug: sparql
part: Using OntoDB
order: 2
kicker: Using OntoDB
description: The SPARQL subset OntoDB accepts, how terms are spelled, and which features are rejected with a line and column.
lede: OntoDB accepts SELECT over a basic graph pattern with filters, and ground INSERT DATA and DELETE DATA. Everything else is rejected with a clear error.
---

## Queries

```sparql
PREFIX ub: <http://example.edu/univ#>
SELECT ?name WHERE {
  ?s a ub:Student ; ub:name ?name ; ub:age ?age .
  FILTER (?age > 21 && ?age <= 30)
}
```

| Feature | Supported |
| --- | --- |
| `PREFIX` declarations | Yes |
| `SELECT ?a ?b` and `SELECT *` | Yes. `*` projects every variable in order of first appearance |
| Basic graph pattern, one group | Yes. `a` means `rdf:type`; `;` repeats the subject; `,` repeats subject and predicate |
| `FILTER` with `= != < > <= >=` combined by `&&` | Yes |
| `DISTINCT`, `LIMIT`, `OFFSET`, `ORDER BY` | Yes. `ORDER BY` sorts by SPARQL term order, and on the indexed backend spills to an external merge sort when rows outgrow half the pool |
| `OPTIONAL`, `UNION`, nested groups, property paths, aggregates | Rejected |

Numbers in a query are `xsd:integer` or `xsd:decimal` literals and compare numerically with numeric literals in the data.

## Updates

```sparql
INSERT DATA { <http://ex/a> <http://ex/p> "one" . }
DELETE DATA { <http://ex/a> <http://ex/p> "one" . }
```

Only ground triples: no variables, no `WHERE`. Inserting a triple that is already stored, or deleting one that is not, changes nothing and is not an error. `DELETE/INSERT WHERE` is rejected. In a persistent database each update statement is one transaction.

## Terms

Every term has one canonical spelling, shared by the loader, the query, and the results:

| Term | Spelling |
| --- | --- |
| IRI | `<http://example.org/materials#Metal>` |
| Plain literal | `"Metal"` |
| Language-tagged literal | `"Métal"@fr` |
| Typed literal | `"21"^^<http://www.w3.org/2001/XMLSchema#integer>` |
| Blank node | `_:b0` |

## Rejected features

`OPTIONAL`, `UNION`, property paths, aggregates, and `DELETE/INSERT WHERE` fail with the feature's name, a line, and a column:

```text
OntoDB> SELECT ?x WHERE { ?x ?p ?o . OPTIONAL { ?x ?q ?r } }
error: OPTIONAL is not supported at line 1, column 30
```

## No reasoning

OWL loads as RDF triples. `rdfs:subClassOf` is data, not a rule, so a query for instances of a class does not return instances of its subclasses. For LUBM, queries 4, 5, 6, and 11 to 13 return a subset for this reason.

::: read
SPARQL 1.1 Query Language (W3C), the sections on basic graph patterns, `FILTER`, and `INSERT DATA` / `DELETE DATA`.
:::
