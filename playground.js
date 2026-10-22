// The OntoDB playground. The engine is OntoDB itself: the C++ code compiled to WebAssembly
// (web/ in the ontodb repo), driven through two exported functions. SPARQL goes to
// ontodb_query, which returns a table; shell commands (a backslash first) go to ontodb_exec,
// which returns the text the native shell would print. Updates are journaled in this
// browser and replayed on the next visit.
(function () {
  var root = document.getElementById("playground");
  if (!root) return;

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el[k] = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    var add = function (c) {
      if (Array.isArray(c)) c.forEach(add);
      else if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
    };
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  }
  function store(op, key, value) {
    try {
      if (op === "get") return localStorage.getItem(key);
      if (op === "set") localStorage.setItem(key, value);
      if (op === "del") localStorage.removeItem(key);
    } catch (e) { /* private window or blocked storage: the page works without it */ }
    return null;
  }

  var PIZZA = "PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>\nPREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n";
  var UB = "PREFIX ub: <http://example.edu/univ#>\n";
  var DATASETS = {
    pizza: { label: "Pizza ontology (27 triples)", files: [["data/pizza.ttl", "/data.ttl"]], load: ["\\load /data.ttl"], prefixes: { "http://www.co-ode.org/ontologies/pizza/pizza.owl#": "pizza:", "http://www.w3.org/2000/01/rdf-schema#": "rdfs:", "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf:", "http://www.w3.org/2002/07/owl#": "owl:" }, examples: [
      ["Named pizzas", PIZZA + "SELECT ?pizza ?label WHERE {\n  ?pizza rdfs:subClassOf pizza:NamedPizza .\n  ?pizza rdfs:label ?label\n}"],
      ["Toppings of a Margherita", PIZZA + "SELECT ?topping WHERE { pizza:MargheritaPizza pizza:hasTopping ?topping }"],
      ["Pizzas and their toppings", PIZZA + "SELECT ?pizza ?topping WHERE {\n  ?pizza rdfs:subClassOf pizza:NamedPizza .\n  ?pizza pizza:hasTopping ?topping\n}"],
      ["Two steps below Pizza", PIZZA + "SELECT ?c WHERE {\n  ?c rdfs:subClassOf ?mid .\n  ?mid rdfs:subClassOf pizza:Pizza\n}"],
      ["Add a pizza (update)", PIZZA + "INSERT DATA {\n  pizza:FunghiPizza rdfs:subClassOf pizza:NamedPizza ;\n    rdfs:label \"Funghi\" ;\n    pizza:hasTopping pizza:MozzarellaTopping .\n}"],
      ["OPTIONAL (OntoDB refuses it)", PIZZA + "SELECT ?p ?l WHERE { ?p rdfs:subClassOf pizza:NamedPizza . OPTIONAL { ?p rdfs:label ?l } }"],
      ["Shell: label the class hierarchy", "\\hindex build"],
      ["Shell: everything under Pizza", "\\under pizza:Pizza"],
      ["Shell: list the commands", "\\help"],
    ] },
    tiny: { label: "University (53 triples)", files: [["data/tiny.ttl", "/data.ttl"]], load: ["\\load /data.ttl"], prefixes: { "http://example.edu/univ#": "ub:", "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf:" }, examples: [
      ["Students and their age", UB + "SELECT ?name ?age WHERE { ?s a ub:Student ; ub:name ?name ; ub:age ?age }"],
      ["Everything about Alice", UB + "SELECT ?p ?o WHERE { ub:Alice ?p ?o }"],
      ["Older than 20", UB + "SELECT ?name WHERE { ?s ub:name ?name ; ub:age ?a . FILTER(?a > 20) }"],
      ["Explain the plan", "\\explain analyze " + UB.replace(/\n/g, " ") + "SELECT ?name WHERE { ?s a ub:Student ; ub:name ?name }"],
    ] },
    go: { label: "Gene Ontology slice (834 classes, with embeddings)", files: [["data/go-slice.ttl", "/data.ttl"], ["data/go-slice.ovec", "/data.ovec"]], load: ["\\load /data.ttl", "\\vload /data.ovec"], prefixes: { "http://purl.obolibrary.org/obo/GO_": "GO:", "http://www.w3.org/2000/01/rdf-schema#": "rdfs:" }, examples: [
      ["Step 1: label the hierarchy (intervals)", "\\hindex build"],
      ["Step 2: everything under “cell death”", "\\under \"cell death\" 10"],
      ["Step 3: nearest terms, exact scan", "\\similar \"apoptotic process\" 8"],
      ["Step 4: nearest, only under “cell death”", "\\similar \"apoptotic process\" 8 under \"cell death\""],
      ["Same query, only under “immune response”", "\\similar \"apoptotic process\" 8 under \"immune response\""],
      ["Step 5: build IVF and HNSW indexes", "\\vindex build all"],
      ["Force a strategy: masked HNSW", "\\similar \"apoptotic process\" 8 under \"cell death\" using mask-hnsw"],
      ["Force a strategy: pre-filter", "\\similar \"apoptotic process\" 8 under \"cell death\" using pre"],
      ["SPARQL: labels of the children of “cell death”", "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nPREFIX GO: <http://purl.obolibrary.org/obo/GO_>\nSELECT ?c ?l WHERE {\n  ?c rdfs:subClassOf GO:0008219 .\n  ?c rdfs:label ?l\n}"],
    ] },
    empty: { label: "Empty store", files: [], load: [], prefixes: {}, examples: [
      ["Add two triples", "INSERT DATA { <http://example.org/a> <http://example.org/knows> <http://example.org/b> . <http://example.org/b> <http://example.org/knows> <http://example.org/c> }"],
      ["Everything", "SELECT ?s ?p ?o WHERE { ?s ?p ?o }"],
      ["Friends of friends", "SELECT ?a ?c WHERE { ?a <http://example.org/knows> ?b . ?b <http://example.org/knows> ?c }"],
      ["Property path (OntoDB refuses it)", "SELECT ?a ?c WHERE { ?a <http://example.org/knows>/<http://example.org/knows> ?c }"],
    ] },
  };

  var m = null, exec = null, query = null;
  var dataset = "pizza", journal = [];
  var picker = h("select", { id: "pg-dataset", "aria-label": "Dataset" }, Object.keys(DATASETS).map(function (k) { return h("option", { value: k, text: DATASETS[k].label }); }));
  var storage = h("select", { id: "pg-storage", "aria-label": "Triple store" },
    h("option", { value: "mem", text: "In-memory store" }), h("option", { value: "indexed", text: "Three B+ tree indexes on a buffer pool" }));
  var examples = h("select", { id: "pg-examples", "aria-label": "Example queries" });
  var editor = h("textarea", { id: "pg-query", spellcheck: "false", "aria-label": "SPARQL query or shell command" });
  var status = h("span", { class: "pg-status" });
  var result = h("div", { id: "pg-result", "aria-live": "polite" });
  var planBox = h("div", { id: "pg-plan" });
  var turtle = h("textarea", { id: "pg-turtle", spellcheck: "false", placeholder: "@prefix ex: <http://example.org/> .\nex:alice ex:knows ex:bob .", "aria-label": "Turtle to load" });
  var busy = false;

  function short(iri) {
    var map = DATASETS[dataset].prefixes, keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) if (iri.indexOf(keys[i]) === 0) return map[keys[i]] + iri.slice(keys[i].length);
    return null;
  }
  function cell(raw) {
    var td = h("td");
    if (raw.charAt(0) === "<") { var s = short(raw.slice(1, -1)); td.className = "pg-iri"; td.textContent = s || raw; if (s) td.title = raw.slice(1, -1); }
    else if (raw.charAt(0) === "\"") { td.className = "pg-literal"; td.textContent = raw; }
    else { td.className = "pg-blank"; td.textContent = raw; }
    return td;
  }
  function table(r) {
    if (!r.columns.length) return h("p", { class: "pg-line" }, "(" + r.rows.length + (r.rows.length === 1 ? " row)" : " rows)"));
    var head = h("tr"); r.columns.forEach(function (c) { head.append(h("th", { text: "?" + c })); });
    var body = h("tbody"); r.rows.forEach(function (row) { var tr = h("tr"); row.forEach(function (v) { tr.append(cell(v)); }); body.append(tr); });
    return h("div", { class: "pg-scroll" }, h("table", { class: "pg-table" }, h("thead", {}, head), body));
  }
  function showError(text) { result.replaceChildren(h("div", { class: "pg-error", role: "alert", text: text })); planBox.replaceChildren(); }
  function stats() {
    var t = exec("\\stats"), o = {};
    t.split("\n").forEach(function (l) { var p = l.split(": "); if (p.length === 2) o[p[0]] = parseInt(p[1], 10); });
    return o;
  }

  function apply(line) { return line.charAt(0) === "\\" ? exec(line) : query(line); }
  function open(k, restore) {
    dataset = k; var d = DATASETS[k];
    m._ontodb_reset();
    var log = [];
    if (storage.value === "indexed") exec("\\set backend indexed");
    return Promise.all(d.files.map(function (f) { return fetch(f[0]).then(function (r) { if (!r.ok) throw new Error(f[0] + ": " + r.status); return r.arrayBuffer(); }).then(function (b) { m.FS.writeFile(f[1], new Uint8Array(b)); }); })).then(function () {
      d.load.forEach(function (c) { log.push(exec(c)); });
      journal = [];
      var saved = restore ? store("get", "ontodb-pg:journal:" + k) : null;
      if (saved) { try { journal = JSON.parse(saved); } catch (e) { journal = []; } }
      journal.forEach(function (j) { if (j.turtle) { m.FS.writeFile("/user.ttl", j.turtle); exec("\\load /user.ttl"); } else query(j.sparql); });
      var size = query("SELECT ?s ?p ?o WHERE { ?s ?p ?o }");
      var count; try { count = JSON.parse(size).rows.length; } catch (e) { count = "?"; }
      status.textContent = count.toLocaleString() + " triples" + (journal.length ? ", with " + journal.length + " of your changes replayed from this browser" : "") + ".";
      examples.replaceChildren.apply(examples, d.examples.map(function (e, i) { return h("option", { value: i, text: e[0] }); }));
      editor.value = d.examples[0][1];
      result.replaceChildren(); planBox.replaceChildren();
      if (log.some(function (l) { return /^error/.test(l); })) showError(log.join("\n"));
    });
  }
  function saveJournal() { store("set", "ontodb-pg:journal:" + dataset, JSON.stringify(journal)); }

  function run() {
    if (busy || !m) return;
    var text = editor.value.trim();
    if (!text) return;
    result.replaceChildren(); planBox.replaceChildren();
    try {
      if (text.charAt(0) === "\\") {
        var out = exec(text);
        result.append(h("pre", { class: "pg-pre", text: out }));
        if (/^\\(set)\b/.test(text) && /backend/.test(text)) { storage.value = /indexed/.test(text) ? "indexed" : "mem"; store("set", "ontodb-pg:storage", storage.value); }
        return;
      }
      var before = storage.value === "indexed" ? stats() : null;
      var r = JSON.parse(query(text));
      if (r.error) return showError("error: " + r.error);
      if (!r.query) {
        journal.push({ sparql: text }); saveJournal();
        result.append(h("p", { class: "pg-line" }, h("b", { text: r.message }), " in " + r.ms.toFixed(2) + " ms. Saved in this browser."));
        return;
      }
      result.append(table(r), h("p", { class: "pg-line" }, "engine time " + r.ms.toFixed(2) + " ms" + (before ? pages(before, stats()) : "")));
      var plan = exec("\\explain analyze " + text);
      planBox.append(h("h4", { text: "OntoDB's plan for this query" }), h("pre", { class: "pg-pre", text: plan.replace(/\n\s*$/, "") }),
        h("p", { class: "pg-note" }, "From \\explain analyze: estimated against actual rows per node, as the native shell prints it."));
    } catch (e) { showError(String(e && e.message || e)); }
  }
  function pages(a, b) {
    var hits = b["buffer hits"] - a["buffer hits"], miss = b["buffer misses"] - a["buffer misses"];
    return "; buffer pool: " + hits + " hits, " + miss + " misses";
  }

  picker.onchange = function () { store("set", "ontodb-pg:dataset", picker.value); open(picker.value, true); };
  storage.onchange = function () {
    store("set", "ontodb-pg:storage", storage.value);
    open(dataset, true);
  };
  examples.onchange = function () { editor.value = DATASETS[dataset].examples[+examples.value][1]; result.replaceChildren(); planBox.replaceChildren(); };
  editor.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); } });

  root.className = "pg";
  root.replaceChildren(
    h("div", { class: "pg-panel" }, h("h3", { text: "Query" }),
      h("p", { class: "pg-sub", text: "SPARQL statements and the shell's \\ commands run on OntoDB, compiled to WebAssembly, in this page. Press Ctrl or Cmd + Enter to run." }),
      h("div", { class: "pg-row" }, h("label", { for: "pg-dataset" }, "Data "), picker, h("label", { for: "pg-storage" }, "Store "), storage),
      h("div", { class: "pg-row" }, h("label", { for: "pg-examples" }, "Example "), examples, status),
      h("div", { class: "pg-row" }, editor),
      h("div", { class: "pg-row" }, h("button", { type: "button", class: "btn solid", onclick: run }, "Run"),
        h("button", { type: "button", class: "btn", onclick: function () { store("del", "ontodb-pg:journal:" + dataset); open(dataset, false); } }, "Reset this store"))),
    h("div", { class: "pg-panel", id: "pg-out-panel" }, h("h3", { text: "Result" }), result, planBox),
    h("details", { class: "pg-panel" }, h("summary", { text: "Load your own Turtle" }),
      h("p", { class: "pg-sub", text: "Paste Turtle or N-Triples and add it to the current store with \\load. It stays in this browser and never leaves it." }), turtle,
      h("div", { class: "pg-row" }, h("button", { type: "button", class: "btn", onclick: function () {
        if (!m) return;
        m.FS.writeFile("/user.ttl", turtle.value);
        var out = exec("\\load /user.ttl");
        if (/^error/.test(out)) return showError(out);
        journal.push({ turtle: turtle.value }); saveJournal();
        result.replaceChildren(h("p", { class: "pg-line" }, out + ". Saved in this browser."));
      } }, "Load into the store"))));
  status.textContent = "loading OntoDB (a 0.9 MB WebAssembly module)…";

  var V = "?v=1";  // bump with a new ontodb_wasm build; browsers cache these files
  var script = h("script", { src: "ontodb_wasm.js" + V });
  script.onload = function () {
    OntoDB({ locateFile: function (f) { return f + V; } }).then(function (mod) {
      m = mod;
      exec = m.cwrap("ontodb_exec", "string", ["string"]);
      query = m.cwrap("ontodb_query", "string", ["string"]);
      if (store("get", "ontodb-pg:storage") === "indexed") storage.value = "indexed";
      var last = store("get", "ontodb-pg:dataset");
      if (last && DATASETS[last]) picker.value = last;
      return open(picker.value, true);
    }).catch(function (e) { status.textContent = ""; showError("OntoDB could not start: " + (e && e.message || e)); });
  };
  script.onerror = function () { showError("Could not load ontodb_wasm.js."); };
  document.head.append(script);
})();
