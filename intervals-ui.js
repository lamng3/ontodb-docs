// The page for intervals.js: edit a class hierarchy, step through the labelling, then ask for
// "everything under C" and watch it become range scans over the postorder numbers.
(function () {
  var rootEl = document.getElementById("intervals");
  if (!rootEl || !window.IVL) return;
  var NS = "http://www.w3.org/2000/svg";
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") el.textContent = attrs[k]; else if (k.slice(0, 2) === "on") el[k] = attrs[k]; else el.setAttribute(k, attrs[k]); });
    var add = function (c) { if (Array.isArray(c)) c.forEach(add); else if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); };
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  }
  function s(tag, attrs, text) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text != null) el.textContent = text;
    return el;
  }
  var DEFAULT = "# Child: Parent, Parent   (a class with two parents makes a non-tree edge)\nAnimal: Thing\nMachine: Thing\nPet: Animal\nWild: Animal\nVehicle: Machine\nRobot: Machine\nDog: Pet\nCat: Pet\nWolf: Wild\nBear: Wild\nCar: Vehicle\nBike: Vehicle\nRoboDog: Dog, Robot\nRoboCar: Car, Robot";
  var STAGES = [
    "The hierarchy. An arrow runs from each class to its parent (rdfs:subClassOf). Classes in a cycle would be merged into one first; this one has none.",
    "A spanning forest: each class keeps one tree edge, to its deepest parent. The dashed edges are the others. Without them the tree alone would give every class one contiguous interval.",
    "Number the forest in postorder. A class's tree descendants are then exactly the numbers from its lowest descendant's number up to its own: one interval. Those numbers are the keys of a B+ tree.",
    "Interval sets, children first: a class takes its own interval and every child's set, merging touching intervals. A class below a dashed edge adds its interval to each of its extra parents.",
    "Ask for everything under a class. Each interval of its set is one range scan over the postorder keys, so the number of scans is the size of the set.",
  ];
  var text = h("textarea", { "aria-label": "Class hierarchy", spellcheck: "false", rows: "9" });
  var pick = h("select", { "aria-label": "Class to query" });
  var back = h("button", { type: "button", class: "btn", text: "Back" });
  var nextB = h("button", { type: "button", class: "btn solid", text: "Next", id: "iv-next" });
  var counter = h("span", { class: "pg-status" });
  var svgBox = h("div", { class: "bt-svg" });
  var msg = h("p", { class: "bt-msg", "aria-live": "polite" });
  var strip = h("div", { class: "iv-strip" });
  var facts = h("div", { class: "bt-state" });
  var stage = 0, L = null;
  var NODE_H = 40, ROW = 84;

  function rebuild() {
    L = IVL.label(IVL.parse(text.value));
    var keep = pick.value;
    pick.replaceChildren.apply(pick, L.classes.map(function (c, i) { return h("option", { value: i, text: c.name }); }));
    pick.value = keep && +keep < L.classes.length ? keep : String(L.roots[0] || 0);
    draw();
  }
  function subOf(v) {
    return (stage >= 2 ? "#" + L.post[v] + " " : "") + (stage >= 3 ? L.sets[v].map(function (iv) { return iv[0] === iv[1] ? "[" + iv[0] + "]" : "[" + iv[0] + "–" + iv[1] + "]"; }).join(" ") : "");
  }
  function width(v) { return Math.max(L.classes[v].name.length * 8 + 18, subOf(v).length * 6.8 + 14, 44); }
  function draw() {
    counter.textContent = "step " + (stage + 1) + " of " + STAGES.length;
    back.disabled = stage === 0; nextB.disabled = stage === STAGES.length - 1;
    msg.textContent = STAGES[stage];
    svgBox.replaceChildren(); strip.replaceChildren(); facts.replaceChildren();
    var n = L.classes.length;
    if (!n) { svgBox.append(h("p", { class: "pg-note", text: "Type a hierarchy above." })); return; }
    var q = +pick.value, inQuery = stage === 4, under = inQuery ? IVL.under(L, q) : null;
    var inSet = {}; if (under) under.members.forEach(function (c) { inSet[c] = true; });
    // layout: leaves of the forest left to right, parents centred over their children
    var pos = {}, x = 10, maxDepth = 0;
    var place = function (v, d) {
      maxDepth = Math.max(maxDepth, d);
      var w = width(v);
      if (!L.treeKids[v].length) { pos[v] = { x: x, w: w, y: 24 + d * ROW }; x += w + 18; return; }
      L.treeKids[v].forEach(function (k) { place(k, d + 1); });
      var a = pos[L.treeKids[v][0]], b = pos[L.treeKids[v][L.treeKids[v].length - 1]];
      pos[v] = { x: (a.x + b.x + b.w) / 2 - w / 2, w: w, y: 24 + d * ROW };
    };
    L.roots.forEach(function (r) { place(r, 0); x += 10; });
    var W = Math.max(x, 220), H = 24 + (maxDepth + 1) * ROW + 10;
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "The class hierarchy" });
    svg.append(s("defs")); svg.firstChild.innerHTML = '<marker id="iv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" class="bt-arrowhead"/></marker>';
    L.parents.forEach(function (ps, c) {
      ps.forEach(function (p) {
        var tree = L.treeParent[c] === p, a = pos[c], b = pos[p];
        var x1 = a.x + a.w / 2, y1 = a.y, x2 = b.x + b.w / 2, y2 = b.y + NODE_H;
        var curved = stage >= 1 && !tree;
        svg.append(s("path", { d: curved ? "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 - 50) + " " + x2 + " " + (y2 + 50) + " " + x2 + " " + y2 : "M" + x1 + " " + y1 + " L" + x2 + " " + y2,
          class: "iv-edge" + (curved ? " extra" : ""), "marker-end": "url(#iv-arrow)" }));
      });
    });
    L.classes.forEach(function (c, v) {
      var p = pos[v], g = s("g", { class: "iv-node" + (inQuery && +pick.value === v ? " asked" : inSet[v] ? " hit" : "") });
      g.append(s("rect", { x: p.x, y: p.y, width: p.w, height: NODE_H, rx: 6 }));
      g.append(s("text", { x: p.x + p.w / 2, y: p.y + 16, "text-anchor": "middle" }, c.name));
      var sub = subOf(v);
      if (sub) { var t = s("text", { x: p.x + p.w / 2, y: p.y + 32, "text-anchor": "middle", class: "iv-set" }); t.textContent = sub; g.append(t); }
      svg.append(g);
    });
    svgBox.append(svg);
    // the B+ tree's key order: classes by postorder number, with the scanned runs marked
    if (stage >= 2) {
      var row = h("div", { class: "iv-cells" });
      var run = {}; if (under) under.scans.forEach(function (sc, i) { for (var k = sc.interval[0]; k <= sc.interval[1]; k++) run[k] = i + 1; });
      for (var k = 1; k <= n; k++) row.append(h("div", { class: "iv-cell" + (run[k] ? " run run" + ((run[k] - 1) % 3 + 1) : "") }, h("span", { text: String(k) }), h("b", { text: L.classes[L.byPost[k]].name })));
      strip.append(h("p", { class: "pg-sub", text: "The B+ tree's key order: classes by postorder number." }), row);
    }
    if (stage === 3) {
      var nt = IVL.nonTree(L);
      facts.append(row3("classes", String(n)), row3("non-tree edges", String(nt.length)), row3("intervals in all", String(L.sets.reduce(function (a, b) { return a + b.length; }, 0))),
        row3("most for one class", String(Math.max.apply(null, L.sets.map(function (a) { return a.length; })))), row3("bound", "|I(c)| ≤ 1 + non-tree edges below c"));
    }
    if (inQuery) {
      facts.append(row3("class", L.classes[q].name), row3("interval set", L.sets[q].map(function (iv) { return "[" + iv[0] + ", " + iv[1] + "]"; }).join(" ")),
        row3("range scans", String(under.scans.length)), row3("classes found", String(under.members.length)),
        row3("found", under.members.map(function (c) { return L.classes[c].name; }).join(", ")));
    }
  }
  function row3(a, b) { return h("div", { class: "bt-row" }, h("span", { text: a }), h("b", { text: b })); }
  nextB.onclick = function () { if (stage < STAGES.length - 1) { stage++; draw(); } };
  back.onclick = function () { if (stage > 0) { stage--; draw(); } };
  pick.onchange = function () { if (stage < 4) stage = 4; draw(); };
  text.oninput = rebuild;
  document.addEventListener("keydown", function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowRight") nextB.click(); else if (e.key === "ArrowLeft") back.click();
  });
  text.value = DEFAULT;
  rootEl.className = "pg bt";
  rootEl.replaceChildren(
    h("div", { class: "pg-panel" }, h("h3", { text: "Class hierarchy" }), text,
      h("div", { class: "pg-row" }, back, nextB, counter, h("label", {}, "Everything under "), pick)),
    h("div", { class: "pg-panel" }, svgBox, msg, strip),
    h("div", { class: "pg-panel" }, h("h3", { text: "Numbers" }), facts));
  rebuild();
  pick.value = String(L.of["Animal"]);
  draw();
})();
