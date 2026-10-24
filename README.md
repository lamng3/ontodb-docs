# OntoDB Manual

The manual for OntoDB, a database management system for ontologies: installing and running it, the shell and SPARQL reference, persistent databases and recovery, file formats, troubleshooting, internals, and the roadmap.

Read it at <https://lamng3.com/ontodb/>.

The site is static HTML. `python3 build.py` regenerates the pages from `content/`. Each page's front matter names its `part` (Getting started, Using OntoDB, Reference, Internals, Project) and its `order` within that part. GitHub Pages serves the HTML at the repository root.

## Shared structure

`normalize.py` (shared by the manuals) runs at the end of the build. It gives every content page a search box, an "On this page" list, previous and next links, and one title format, and writes `search-index.json`. It is called by `build.py`.

## The playground and the visualizations

`playground.html` runs OntoDB itself: `ontodb_wasm.js` and `ontodb_wasm.wasm` are built from the `web/` directory of the ontodb repository (`web/build.sh`, which needs emsdk) and copied here. `data/go-slice.*` comes from `scripts/web-slice` in that repository. After a new build, bump `V` in `playground.js`, because browsers cache these files.

`btree-scan.js` and `intervals.js` hold the algorithms behind the two step-through demos on the B+ tree and semantic-search pages. `node btree-scan.test.mjs` and `node intervals.test.mjs` check them against brute force on random inputs; the `-ui.js` files only draw.

## The showcase

`showcase/index.html` is a copy of `showcase/index.html` in the ontodb repository: one LUBM query traced page by page, plans, a crash and restart, hierarchy search and the benchmarks, all from the shell's own output. Rebuild it there (`python3 showcase/record.py && python3 showcase/build.py`) and copy it here.
