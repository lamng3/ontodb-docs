// Shows what the real OntoDB shell printed for each query (demo-data.json, exported by demo_data.py).
(function () {
  var root = document.getElementById("demo");
  if (!root) return;
  var el = function (id) { return document.getElementById(id); };
  var data, current = 0;
  var PREFIXES = [
    ["http://www.co-ode.org/ontologies/pizza/pizza.owl#", "pizza:"],
    ["http://www.w3.org/2000/01/rdf-schema#", "rdfs:"],
    ["http://www.w3.org/2002/07/owl#", "owl:"],
    ["http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf:"],
  ];
  // Shorten IRIs for display: <http://…#Name> becomes pizza:Name.
  function short(text) {
    PREFIXES.forEach(function (p) { text = text.split("<" + p[0]).join(p[1]).split(p[0]).join(p[1]); });
    return text.replace(/(pizza:\w+|rdfs:\w+|owl:\w+|rdf:\w+)>/g, "$1");
  }
  // A recorded value: <iri> or "literal" (as the shell printed it) into a term the table can show.
  function cell(raw) {
    if (raw.charAt(0) === "<") return { text: PG.short(raw.slice(1, -1), PREFIX_MAP), kind: "iri", full: raw.slice(1, -1) };
    if (raw.charAt(0) === '"') return { text: raw, kind: "literal" };
    return { text: raw, kind: "other" };
  }
  var PREFIX_MAP = { "http://www.co-ode.org/ontologies/pizza/pizza.owl#": "pizza:" };
  function showRows(q) {
    var r = q.result;
    PG.show(el("out"), { kind: "select", vars: r.columns, rows: r.rows.map(function (row) { return row.map(cell); }), ms: parseFloat(q.plan.execution) || 0 });
    el("out").lastChild.textContent = r.count + (r.count === 1 ? " row" : " rows") + " · printed by the ontodb shell";
  }
  function showPlan(q) {
    var out = el("out"), ul = document.createElement("ul");
    ul.className = "plan";
    q.plan.nodes.forEach(function (n) {
      var li = document.createElement("li"); li.style.setProperty("--d", n.depth);
      var op = document.createElement("span"); op.className = "op"; op.textContent = n.op.replace(/<([^>]+)>/g, function (m, iri) { return PG.short(iri, PREFIX_MAP); });
      var est = document.createElement("span"); est.className = "est"; est.textContent = "estimated " + n.estimated;
      var act = document.createElement("span"); act.className = "rows" + (n.actual != null && n.actual !== n.estimated ? " off" : "");
      act.textContent = n.actual != null ? "actual " + n.actual : n.note;
      li.append(op, est, act); ul.append(li);
    });
    out.replaceChildren(ul);
    var line = document.createElement("p"); line.className = "pg-line"; line.textContent = "execution " + q.plan.execution; out.append(line);
  }

  function pick(i) {
    current = i;
    var q = data.queries[i];
    el("question").textContent = q.question;
    el("sparql").textContent = q.sparql.replace(" WHERE { ", "\nWHERE {\n  ").replace(/ \. /g, " .\n  ").replace(/ \}$/, "\n}");
    el("out").textContent = "Press Run.";
    Array.prototype.forEach.call(el("tabs").children, function (b, j) { b.setAttribute("aria-selected", j === i ? "true" : "false"); });
  }
  fetch("demo-data.json").then(function (r) { return r.json(); }).then(function (d) {
    data = d;
    d.queries.forEach(function (q, i) {
      var b = document.createElement("button");
      b.className = "tab";
      b.setAttribute("role", "tab");
      b.textContent = q.title;
      b.onclick = function () { pick(i); };
      el("tabs").appendChild(b);
    });
    el("run").onclick = function () { showRows(d.queries[current]); };
    el("explain").onclick = function () { showPlan(d.queries[current]); };
    pick(0);
    el("run").onclick();
  });
})();
