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
    el("run").onclick = function () { el("out").textContent = short(d.queries[current].rows); };
    el("explain").onclick = function () { el("out").textContent = short(d.queries[current].plan); };
    pick(0);
    el("run").onclick();
  });
})();
