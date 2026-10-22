# OntoDB Manual

The manual for OntoDB, a database management system for ontologies: installing and running it, the shell and SPARQL reference, persistent databases and recovery, file formats, troubleshooting, internals, and the roadmap.

Read it at <https://lamng3.com/ontodb/>.

The site is static HTML. `python3 build.py` regenerates the pages from `content/`. Each page's front matter names its `part` (Getting started, Using OntoDB, Reference, Internals, Project) and its `order` within that part. GitHub Pages serves the HTML at the repository root.

## Shared structure

`normalize.py` (a copy of the one in `memcommit-docs`) runs at the end of the build. It gives every content page a search box, an "On this page" list, previous and next links, and one title format, and writes `search-index.json`. It is called by `build.py`.
