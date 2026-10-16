---
title: Shell reference
slug: shell
part: Using OntoDB
order: 1
kicker: Using OntoDB
description: Starting the ontodb shell, how input is read, sessions, and every shell command.
lede: The shell is OntoDB's interface. It reads SPARQL and backslash commands from standard input and prints results to standard output.
---

## Starting the shell

```text
ontodb [--strict] [--db] [dir]
```

| Invocation | Database |
| --- | --- |
| `ontodb` | In memory. Nothing is kept after `\quit` |
| `ontodb dir` or `ontodb --db dir` | Persistent, in `dir`, created if missing. The first line reports what was recovered |
| `ontodb --strict dir` | Persistent, but refuses to open if the log is damaged |

The shell reads standard input, so a script can be piped in: `ontodb mydb < script.txt`. The prompt `OntoDB>` is printed before each statement whenever the shell reads standard input, piped or not; with sessions it shows the session number, `OntoDB:2>`.

## How input is read

- A line that starts with `\` is one shell command.
- Anything else is SPARQL. A statement may span lines and runs when its `{ }` group has opened and closed and every string is closed. A `PREFIX` line stays pending until the query that uses it is complete.
- `#` starts a comment, except inside a string or an IRI, so `<http://example.edu/univ#Student>` is read whole.
- `\quit` leaves at once, even in the middle of a statement.

## Commands

| Command | What it does |
| --- | --- |
| `\load path` | Loads a Turtle (`.ttl`), N-Triples (`.nt`), or RDF/XML (`.rdf`, `.owl`) file. In a persistent database the whole file is one transaction |
| SPARQL statement | Runs a query or an update. In a persistent database an update is one transaction |
| `\explain query` | Prints the plan without running it |
| `\explain analyze query` | Runs the query and prints each plan node with its estimated and actual rows, then the time |
| `\checkpoint` | Persistent databases: writes a snapshot and empties the log |
| `\verify` | Persistent databases: checks the snapshot and log, rebuilds from them, and compares with the live database |
| `\log [n]` | Persistent databases: prints the last `n` log records (default 20), oldest first |
| `\crash` | Persistent databases: exits immediately without flushing, to test recovery |
| `\stats` | Prints page, buffer, and log counters |
| `\timing on` or `off` | Prints each statement's time after its result |
| `\set` | Prints the settings |
| `\set knob value` | Changes a setting. See [Settings](config.html) |
| `\session n` | Sends the following input to session `n`, creating it if needed |
| `\help` | Lists the commands |
| `\quit`, `\q` | Leaves the shell |

In an in-memory database, `\checkpoint`, `\log`, and `\crash` answer `not built yet`, and `\verify` says there is nothing on disk to verify.

`\bpm` and `\page <id>` inspect the buffer pool; with the default memory backend they answer `no buffer pool`. `\trace on|off` prints component events to stderr. `\tree spo` and `\tree spo dot` draw an index on the indexed backend. `\begin`, `\commit`, and `\abort` run an explicit transaction in the current session; `\txns` and `\locks` list transactions and the lock table.

## Results and errors

A query prints its variables on one line, then one row per line in canonical spelling (`<iri>`, `"literal"`, `"lex"@en`, `"lex"^^<datatype>`, `_:blank`), then a row count. An update prints how many triples it changed: `inserted 1 triple`, `deleted 0 triples`.

A statement never crashes the shell. A parse or bind error prints its line and column; any other failure prints `error:` and a message. See [Messages and troubleshooting](troubleshooting.html).

## Sessions

`\quit`, `\help`, and `\session` run on the main thread. Every other command runs on the current session's worker thread. Sessions share one database. Until transactions are built, sessions are separate prompts, not isolated transactions.
