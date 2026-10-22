// The page for btree-scan.js: controls, the tree drawn as SVG, the pseudocode, and the iterator's state.
(function () {
  var rootEl = document.getElementById("btree-scan");
  if (!rootEl || !window.BTS) return;
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
  var PRESETS = {
    "ids: 40 terms in first-seen order": function () { var a = []; for (var i = 1; i <= 40; i++) a.push(i); return a; },
    "ids: 24 sparse ids": function () { return [3, 8, 11, 14, 19, 23, 27, 31, 36, 40, 44, 47, 52, 55, 61, 66, 70, 73, 79, 84, 88, 91, 95, 99]; },
    "ids: 12 ids (one split)": function () { return [5, 9, 14, 20, 21, 30, 33, 41, 47, 52, 60, 64]; },
  };
  var preset = h("select", { "aria-label": "Keys" }, Object.keys(PRESETS).map(function (k) { return h("option", { value: k, text: k }); }));
  var keysIn = h("input", { type: "text", "aria-label": "Keys, comma separated", class: "grow" });
  var leafCap = h("select", { "aria-label": "Keys per leaf" }, [3, 4, 5].map(function (n) { return h("option", { value: n, text: n + " keys per leaf" }); }));
  var fanout = h("select", { "aria-label": "Children per internal page" }, [3, 4].map(function (n) { return h("option", { value: n, text: n + " children per page" }); }));
  var lowerIn = h("input", { type: "number", "aria-label": "Lower bound", value: "17" });
  var upperIn = h("input", { type: "number", "aria-label": "Upper bound (exclusive)", value: "29" });
  var back = h("button", { type: "button", class: "btn", text: "Back" });
  var next = h("button", { type: "button", class: "btn solid", text: "Next", id: "bt-next" });
  var play = h("button", { type: "button", class: "btn", text: "Play" });
  var reset = h("button", { type: "button", class: "btn", text: "Reset" });
  var counter = h("span", { class: "pg-status" });
  var svgBox = h("div", { class: "bt-svg" });
  var msg = h("p", { class: "bt-msg", "aria-live": "polite" });
  var code = h("pre", { class: "bt-code" });
  var state = h("div", { class: "bt-state" });

  var tree, frames, at = 0, timer = null;
  function parseKeys() {
    return keysIn.value.split(/[\s,]+/).filter(Boolean).map(Number).filter(function (n) { return isFinite(n) && Math.floor(n) === n; });
  }
  function rebuild() {
    stop();
    var keys = parseKeys();
    tree = BTS.build(keys, +leafCap.value, +fanout.value);
    var lo = parseInt(lowerIn.value, 10), up = parseInt(upperIn.value, 10);
    if (isNaN(lo)) lo = 0; if (isNaN(up)) up = lo;
    frames = BTS.trace(tree, lo, up); at = 0; draw();
  }
  function layout() {
    var cap = +leafCap.value, cell = 30, gap = 22, pad = 6, top = 22, rowH = 84;
    var byDepth = {}, pos = {};
    var height = 0; (function d(p, depth) { p.depth = depth; height = Math.max(height, depth); if (!p.leaf) p.kids.forEach(function (k) { d(k, depth + 1); }); })(tree.byId[tree.root], 0);
    var x = 8;
    tree.leaves.forEach(function (l) { var w = l.keys.length * cell + pad * 2; pos[l.id] = { x: x, w: w, y: top + height * rowH }; x += w + gap; });
    (function place(p) {
      if (p.leaf) return;
      p.kids.forEach(place);
      var w = Math.max(p.keys.length, 1) * cell + pad * 2;
      var l = pos[p.kids[0].id], r = pos[p.kids[p.kids.length - 1].id];
      pos[p.id] = { x: (l.x + r.x + r.w) / 2 - w / 2, w: w, y: top + p.depth * rowH };
    })(tree.byId[tree.root]);
    return { pos: pos, width: Math.max(x, 200), height: top + height * rowH + 70, cell: cell, pad: pad };
  }
  function draw() {
    var f = frames[at], lo = parseInt(lowerIn.value, 10), up = parseInt(upperIn.value, 10);
    counter.textContent = "step " + (at + 1) + " of " + frames.length;
    back.disabled = at === 0; next.disabled = at === frames.length - 1;
    msg.textContent = f.text;
    // pseudocode
    code.replaceChildren.apply(code, BTS.CODE.map(function (line, i) { return h("span", { class: "bt-line" + (i === f.line ? " on" : "") }, line + "\n"); }));
    // tree
    svgBox.replaceChildren();
    if (tree.root == null) { svgBox.append(h("p", { class: "pg-note", text: "The tree is empty." })); renderState(f); return; }
    var L = layout();
    var svg = s("svg", { viewBox: "0 0 " + L.width + " " + L.height, width: L.width, height: L.height, role: "img", "aria-label": "The B+ tree" });
    svg.append(s("defs", {}, null));
    svg.firstChild.innerHTML = '<marker id="bt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="bt-arrowhead"/></marker>';
    var seen = {}; for (var i = 0; i <= at; i++) if (frames[i].page != null && (i === 0 || frames[i].page !== frames[i - 1].page || frames[i].line === 2 || frames[i].line === 11)) seen[frames[i].page] = true;
    // parent-child lines
    tree.pages.forEach(function (p) {
      if (p.leaf) return;
      var a = L.pos[p.id];
      p.kids.forEach(function (k) {
        var b = L.pos[k.id], taken = f.choose === k.id || (seen[p.id] && seen[k.id] && frames.slice(0, at + 1).some(function (g) { return g.choose === k.id; }));
        svg.append(s("line", { x1: a.x + a.w / 2, y1: a.y + 26, x2: b.x + b.w / 2, y2: b.y, class: "bt-edge" + (taken ? " taken" : "") }));
      });
    });
    // sibling links
    var linked = {}; frames.slice(0, at + 1).forEach(function (g) { if (g.link) linked[g.link[0]] = true; });
    tree.leaves.forEach(function (l) {
      if (l.next == null) return;
      var a = L.pos[l.id], b = L.pos[l.next];
      svg.append(s("path", { d: "M" + (a.x + a.w) + " " + (a.y + 13) + " L" + (b.x - 1) + " " + (b.y + 13), class: "bt-link" + (linked[l.id] ? " taken" : ""), "marker-end": "url(#bt-arrow)" }));
    });
    tree.pages.forEach(function (p) {
      var q = L.pos[p.id], g = s("g", { class: "bt-node" + (f.page === p.id ? " now" : seen[p.id] ? " seen" : "") });
      g.append(s("rect", { x: q.x, y: q.y, width: q.w, height: 26, rx: 5 }));
      g.append(s("text", { x: q.x + 2, y: q.y - 5, class: "bt-pid" }, "p" + p.id));
      p.keys.forEach(function (k, i) {
        var cx = q.x + L.pad + i * L.cell, cls = "bt-key";
        if (p.leaf && k >= lo && k < up) cls += " in";
        if (p.leaf && f.emitted.indexOf(k) >= 0) cls += " out";
        if (p.leaf && f.it.leaf === p.id && f.it.keys.length && k === f.it.keys[f.it.pos] && !f.it.end) cls += " cur";
        if (i > 0) g.append(s("line", { x1: cx, y1: q.y + 4, x2: cx, y2: q.y + 22, class: "bt-sep" }));
        g.append(s("text", { x: cx + L.cell / 2, y: q.y + 18, class: cls, "text-anchor": "middle" }, String(k)));
      });
      svg.append(g);
    });
    svgBox.append(svg);
    var here = L.pos[f.page];
    if (here) svgBox.scrollLeft = here.x + here.w / 2 - svgBox.clientWidth / 2;
    renderState(f);
  }
  function renderState(f) {
    var it = f.it;
    state.replaceChildren(
      h("div", { class: "bt-row" }, h("span", { text: "pages read" }), h("b", { text: String(f.reads) })),
      h("div", { class: "bt-row" }, h("span", { text: "iterator: leaf" }), h("b", { text: it.leaf == null ? "none" : "p" + it.leaf })),
      h("div", { class: "bt-row" }, h("span", { text: "keys copied" }), h("b", { text: it.keys.length ? it.keys.map(function (k, i) { return i === it.pos && !it.end ? "[" + k + "]" : String(k); }).join(" ") : "none" })),
      h("div", { class: "bt-row" }, h("span", { text: "next leaf" }), h("b", { text: it.next == null ? "INVALID" : "p" + it.next })),
      h("div", { class: "bt-row" }, h("span", { text: "keys given" }), h("b", { text: f.emitted.length ? f.emitted.join(" ") : "none yet" })));
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; play.textContent = "Play"; } }
  next.onclick = function () { stop(); if (at < frames.length - 1) { at++; draw(); } };
  back.onclick = function () { stop(); if (at > 0) { at--; draw(); } };
  reset.onclick = function () { stop(); at = 0; draw(); };
  play.onclick = function () {
    if (timer) return stop();
    if (at === frames.length - 1) at = 0;
    play.textContent = "Pause";
    timer = setInterval(function () { if (at >= frames.length - 1) return stop(); at++; draw(); }, 700);
  };
  preset.onchange = function () { keysIn.value = PRESETS[preset.value]().join(", "); rebuild(); };
  [keysIn, leafCap, fanout, lowerIn, upperIn].forEach(function (el) { el.onchange = rebuild; });
  document.addEventListener("keydown", function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowRight") next.click(); else if (e.key === "ArrowLeft") back.click();
  });

  keysIn.value = PRESETS[preset.value]().join(", ");
  rootEl.className = "pg bt";
  rootEl.replaceChildren(
    h("div", { class: "pg-panel" },
      h("div", { class: "pg-row" }, h("label", {}, "Keys "), preset, leafCap, fanout),
      h("div", { class: "pg-row" }, keysIn),
      h("div", { class: "pg-row" }, h("label", {}, "Range from "), lowerIn, h("label", {}, "up to, not including "), upperIn),
      h("div", { class: "pg-row" }, back, next, play, reset, counter)),
    h("div", { class: "pg-panel" }, svgBox, msg),
    h("div", { class: "bt-cols" }, h("div", { class: "pg-panel" }, code), h("div", { class: "pg-panel" }, h("h3", { text: "Iterator state" }), state)));
  rebuild();
})();
