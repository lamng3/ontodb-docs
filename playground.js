// The OntoDB playground: SPARQL over the Pizza ontology (or your own Turtle) in the browser, with the store kept in IndexedDB.
// The engine is Oxigraph (WebAssembly), not OntoDB. Plans shown here are OntoDB's own, recorded from its shell.
(async function () {
  var root = document.getElementById("playground");
  if (!root) return;
  var h = PG.h;
  var PIZZA = "PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>\nPREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nPREFIX owl: <http://www.w3.org/2002/07/owl#>\n";
  var UB = "PREFIX ub: <http://example.edu/univ#>\nPREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n";
  var DATASETS = {
    pizza: { label: "Pizza ontology (27 triples)", file: "data/pizza.ttl", prefixes: { "http://www.co-ode.org/ontologies/pizza/pizza.owl#": "pizza:" }, examples: [
      ["Named pizzas", PIZZA + "SELECT ?pizza ?label WHERE {\n  ?pizza rdfs:subClassOf pizza:NamedPizza .\n  ?pizza rdfs:label ?label\n}"],
      ["Toppings of a Margherita", PIZZA + "SELECT ?topping WHERE { pizza:MargheritaPizza pizza:hasTopping ?topping }"],
      ["Pizzas and their toppings", PIZZA + "SELECT ?pizza ?topping WHERE {\n  ?pizza rdfs:subClassOf pizza:NamedPizza .\n  ?pizza pizza:hasTopping ?topping\n}"],
      ["Two steps below Pizza", PIZZA + "SELECT ?c WHERE {\n  ?c rdfs:subClassOf ?mid .\n  ?mid rdfs:subClassOf pizza:Pizza\n}"],
      ["Count toppings per pizza", PIZZA + "SELECT ?pizza (COUNT(?t) AS ?toppings) WHERE { ?pizza pizza:hasTopping ?t } GROUP BY ?pizza"],
      ["Add a pizza (update)", PIZZA + "INSERT DATA {\n  pizza:FunghiPizza rdfs:subClassOf pizza:NamedPizza ;\n    rdfs:label \"Funghi\" ;\n    pizza:hasTopping pizza:MozzarellaTopping .\n}"],
    ] },
    tiny: { label: "University (tiny.ttl)", file: "data/tiny.ttl", prefixes: { "http://example.edu/univ#": "ub:" }, examples: [
      ["Students and their age", UB + "SELECT ?name ?age WHERE { ?s a ub:Student ; ub:name ?name ; ub:age ?age }"],
      ["Everything about Alice", UB + "SELECT ?p ?o WHERE { ub:Alice ?p ?o }"],
      ["Older than 20", UB + "SELECT ?name WHERE { ?s ub:name ?name ; ub:age ?a . FILTER(?a > 20) }"],
    ] },
    empty: { label: "Empty store", file: null, prefixes: {}, examples: [["Add two triples", "INSERT DATA { <http://example.org/a> <http://example.org/knows> <http://example.org/b> . <http://example.org/b> <http://example.org/knows> <http://example.org/c> }"], ["Friends of friends", "SELECT ?a ?c WHERE { ?a <http://example.org/knows>/<http://example.org/knows> ?c }"]] },
  };
  var recorded = null;
  fetch("demo-data.json").then(function (r) { return r.json(); }).then(function (d) { recorded = d.queries; }).catch(function () {});

  var dataset = "pizza", handle = null;
  var picker = h("select", { id: "pg-dataset", "aria-label": "Dataset" }, Object.keys(DATASETS).map(function (k) { return h("option", { value: k, text: DATASETS[k].label }); }));
  var examples = h("select", { id: "pg-examples", "aria-label": "Example queries" });
  var editor = h("textarea", { id: "pg-query", spellcheck: "false", "aria-label": "SPARQL query" });
  var status = h("span", { class: "pg-status" });
  var result = h("div", { id: "pg-result", "aria-live": "polite" });
  var planBox = h("div", { id: "pg-plan" });
  var turtle = h("textarea", { id: "pg-turtle", spellcheck: "false", placeholder: "@prefix ex: <http://example.org/> .\nex:alice ex:knows ex:bob .", "aria-label": "Turtle to load" });

  function seedFor(k) { return DATASETS[k].file ? fetch(DATASETS[k].file).then(function (r) { return r.text(); }).then(function (t) { return [{ text: t, format: "text/turtle" }]; }) : Promise.resolve([]); }
  async function open(k) {
    dataset = k; status.textContent = "loading the engine…";
    handle = await PG.openStore("ontodb:" + k, await seedFor(k));
    status.textContent = handle.store.size.toLocaleString() + " triples" + (handle.restored ? ", restored from this browser" : ", loaded fresh") + ". Changes are saved in this browser.";
    examples.replaceChildren.apply(examples, DATASETS[k].examples.map(function (e, i) { return h("option", { value: i, text: e[0] }); }));
    editor.value = DATASETS[k].examples[0][1];
    result.replaceChildren(); planBox.replaceChildren();
  }
  function norm(q) { return q.split("\n").filter(function (l) { return !/^\s*PREFIX/i.test(l); }).join(" ").replace(/\s+/g, " ").trim(); }
  function plan(query) {
    planBox.replaceChildren();
    if (dataset !== "pizza" || !recorded) return;
    var hit = recorded.filter(function (q) { return norm(q.sparql) === norm(query); })[0];
    if (!hit) { planBox.append(h("p", { class: "pg-note" }, "OntoDB's plan is shown for the recorded Pizza queries (the first four examples). For any other query, run ", h("code", { text: "\\explain analyze <query>" }), " in the ontodb shell.")); return; }
    var ul = h("ul", { class: "plan" }, hit.plan.nodes.map(function (n) {
      return h("li", { style: "--d:" + n.depth }, h("span", { class: "op", text: n.op.replace(/<([^>]+)>/g, function (m, iri) { return PG.short(iri, DATASETS.pizza.prefixes); }) }), h("span", { class: "est", text: "estimated " + n.estimated }),
        h("span", { class: "rows" + (n.actual != null && n.actual !== n.estimated ? " off" : ""), text: n.actual != null ? "actual " + n.actual : n.note }));
    }));
    planBox.append(h("h4", { text: "OntoDB's plan for this query" }), ul, h("p", { class: "pg-note" }, "Recorded from the real ontodb shell with \\explain analyze: estimated against actual rows per node. The rows above come from the in-browser engine."));
  }
  async function run() {
    result.replaceChildren(); planBox.replaceChildren();
    try {
      var r = PG.run(handle.store, editor.value, DATASETS[dataset].prefixes);
      PG.show(result, r);
      if (r.kind === "update") { await handle.save(); status.textContent = handle.store.size.toLocaleString() + " triples. Saved in this browser."; }
      else plan(editor.value);
    } catch (e) { result.append(h("div", { class: "pg-error", role: "alert", text: String(e.message || e) })); }
  }
  picker.onchange = function () { open(picker.value); };
  examples.onchange = function () { editor.value = DATASETS[dataset].examples[+examples.value][1]; result.replaceChildren(); planBox.replaceChildren(); };
  editor.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); } });

  root.className = "pg";
  root.replaceChildren(
    h("div", { class: "pg-panel" }, h("h3", { text: "Query" }), h("p", { class: "pg-sub", text: "SPARQL 1.1 queries and updates run in your browser. Press Ctrl or Cmd + Enter to run." }),
      h("div", { class: "pg-row" }, h("label", { for: "pg-dataset" }, "Data "), picker, h("label", { for: "pg-examples" }, "Example "), examples, status),
      h("div", { class: "pg-row" }, editor),
      h("div", { class: "pg-row" }, h("button", { type: "button", class: "btn solid", onclick: run }, "Run"),
        h("button", { type: "button", class: "btn", onclick: async function () { await handle.reset(await seedFor(dataset)); await open(dataset); } }, "Reset this store"))),
    h("div", { class: "pg-panel", id: "pg-out-panel" }, h("h3", { text: "Result" }), result, planBox),
    h("details", { class: "pg-panel" }, h("summary", { text: "Load your own Turtle" }),
      h("p", { class: "pg-sub", text: "Paste Turtle and add it to the current store. It stays in this browser (IndexedDB) and never leaves it." }), turtle,
      h("div", { class: "pg-row" }, h("button", { type: "button", class: "btn", onclick: async function () {
        try { handle.store.load(turtle.value, { format: "text/turtle" }); await handle.save(); status.textContent = handle.store.size.toLocaleString() + " triples. Saved in this browser."; result.replaceChildren(h("p", { class: "pg-line", text: "Loaded." })); }
        catch (e) { result.replaceChildren(h("div", { class: "pg-error", role: "alert", text: String(e.message || e) })); } } }, "Load into the store"))));
  await open("pizza");
})();
