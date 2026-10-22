// Interval labelling of a class hierarchy, as OntoDB's \hindex build does it (Agrawal, Borgida,
// Jagadish 1989): collapse cycles, take a spanning forest, number it in postorder, and give each
// class the set of postorder intervals that hold its descendants. "Everything under C" is then
// one range scan per interval of C.
(function (root) {
  // "Child: Parent1, Parent2" per line. A class that only appears as a parent is a root.
  function parse(text) {
    var parents = {}, order = [];
    var add = function (n) { if (!(n in parents)) { parents[n] = []; order.push(n); } };
    text.split("\n").forEach(function (line) {
      line = line.replace(/#.*/, "").trim(); if (!line) return;
      var i = line.indexOf(":"), name = (i < 0 ? line : line.slice(0, i)).trim();
      add(name);
      if (i >= 0) line.slice(i + 1).split(",").map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (p) { add(p); if (parents[name].indexOf(p) < 0 && p !== name) parents[name].push(p); });
    });
    return { names: order, parents: parents };
  }

  // Tarjan's strongest components over child -> parent edges; each component becomes one class.
  function collapse(dag) {
    var index = 0, stack = [], on = {}, idx = {}, low = {}, comp = {}, comps = [];
    function visit(v) {
      idx[v] = low[v] = index++; stack.push(v); on[v] = true;
      dag.parents[v].forEach(function (w) {
        if (!(w in idx)) { visit(w); low[v] = Math.min(low[v], low[w]); }
        else if (on[w]) low[v] = Math.min(low[v], idx[w]);
      });
      if (low[v] === idx[v]) {
        var members = [], w;
        do { w = stack.pop(); on[w] = false; members.push(w); } while (w !== v);
        members.sort(dag.names.indexOf.bind(dag.names));
        members.forEach(function (m) { comp[m] = comps.length; });
        comps.push(members);
      }
    }
    dag.names.forEach(function (v) { if (!(v in idx)) visit(v); });
    // Condensed graph: class i has parents (components) and children.
    var cparents = comps.map(function () { return []; }), cchildren = comps.map(function () { return []; });
    dag.names.forEach(function (v) {
      dag.parents[v].forEach(function (p) {
        var a = comp[v], b = comp[p];
        if (a !== b && cparents[a].indexOf(b) < 0) { cparents[a].push(b); cchildren[b].push(a); }
      });
    });
    // Keep the input order for readable output: sort components by their first member.
    var rank = comps.map(function (m, i) { return i; }).sort(function (a, b) { return dag.names.indexOf(comps[a][0]) - dag.names.indexOf(comps[b][0]); });
    var remap = {}; rank.forEach(function (old, nu) { remap[old] = nu; });
    return {
      classes: rank.map(function (old) { return { name: comps[old].join(" = "), members: comps[old] }; }),
      parents: rank.map(function (old) { return cparents[old].map(function (p) { return remap[p]; }).sort(function (a, b) { return a - b; }); }),
      children: rank.map(function (old) { return cchildren[old].map(function (p) { return remap[p]; }).sort(function (a, b) { return a - b; }); }),
      of: Object.keys(comp).reduce(function (o, k) { o[k] = remap[comp[k]]; return o; }, {}),
    };
  }

  function label(dag) {
    var g = collapse(dag), n = g.classes.length;
    // depth = longest path from a root; the tree parent is the deepest parent (the first on ties).
    var depth = new Array(n).fill(-1);
    (function d() { var visit = function (v) { if (depth[v] >= 0) return depth[v]; depth[v] = g.parents[v].length ? 1 + Math.max.apply(null, g.parents[v].map(visit)) : 0; return depth[v]; }; for (var v = 0; v < n; v++) visit(v); })();
    var treeParent = g.parents.map(function (ps) { var best = -1; ps.forEach(function (p) { if (best < 0 || depth[p] > depth[best]) best = p; }); return best; });
    var treeKids = g.classes.map(function () { return []; }), roots = [];
    for (var v = 0; v < n; v++) (treeParent[v] < 0 ? roots : treeKids[treeParent[v]]).push(v);
    var post = new Array(n), low = new Array(n), counter = 0, byPost = [];
    var number = function (v) {
      var first = counter + 1;
      treeKids[v].forEach(number);
      post[v] = ++counter; low[v] = first; byPost[counter] = v;
    };
    roots.forEach(number);
    // Interval sets, children first: own subtree interval plus every child's set, merged.
    var sets = new Array(n), done = new Array(n).fill(false);
    function merge(list) {
      list = list.slice().sort(function (a, b) { return a[0] - b[0]; });
      var out = [];
      list.forEach(function (iv) { var last = out[out.length - 1]; if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1]); else out.push([iv[0], iv[1]]); });
      return out;
    }
    (function fill() { var go = function (v) { if (done[v]) return; done[v] = true; var all = [[low[v], post[v]]]; g.children[v].forEach(function (c) { go(c); all = all.concat(sets[c]); }); sets[v] = merge(all); }; for (var v = 0; v < n; v++) go(v); })();
    return { classes: g.classes, parents: g.parents, children: g.children, of: g.of, depth: depth, treeParent: treeParent, treeKids: treeKids, roots: roots, post: post, low: low, byPost: byPost, sets: sets };
  }

  // The classes at or below class v, found the way \under does: one range scan per interval.
  function under(L, v) {
    var scans = L.sets[v].map(function (iv) { var rows = []; for (var p = iv[0]; p <= iv[1]; p++) rows.push(L.byPost[p]); return { interval: iv, rows: rows }; });
    return { scans: scans, members: [].concat.apply([], scans.map(function (s) { return s.rows; })) };
  }
  // A non-tree edge is a child -> parent edge that is not its child's tree edge.
  function nonTree(L) {
    var out = []; L.parents.forEach(function (ps, c) { ps.forEach(function (p) { if (L.treeParent[c] !== p) out.push([c, p]); }); }); return out;
  }
  var api = { parse: parse, label: label, under: under, nonTree: nonTree };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.IVL = api;
})(typeof window !== "undefined" ? window : globalThis);
