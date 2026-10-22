// B+ tree range scan, step by step. The trace mirrors OntoDB's BPlusTree::BeginRange and
// IndexIterator (src/storage/index/): descend with ChildFor, lower_bound in the leaf, Take the
// keys below the upper bound, then Settle along the right-sibling links. The range is
// half-open, [lower, upper), as in the C++.
(function (root) {
  // Bulk-loads sorted unique keys the way BPlusTree::BulkLoad does: leaves filled completely,
  // each level above built from the first keys of the level below, and a last node that would
  // be under half full shares its entries evenly with its left neighbour.
  function chunk(items, cap) {
    var out = [];
    for (var i = 0; i < items.length; i += cap) out.push(items.slice(i, i + cap));
    if (out.length > 1) {
      var last = out[out.length - 1], min = Math.ceil(cap / 2);
      if (last.length < min) {
        var prev = out[out.length - 2], all = prev.concat(last), half = Math.ceil(all.length / 2);
        out[out.length - 2] = all.slice(0, half);
        out[out.length - 1] = all.slice(half);
      }
    }
    return out;
  }
  function build(keys, leafCap, fanout) {
    keys = Array.from(new Set(keys)).sort(function (a, b) { return a - b; });
    var pages = [], next = 1;
    var leaves = chunk(keys, leafCap).map(function (ks) { return { id: next++, leaf: true, keys: ks, next: null, depth: 0 }; });
    for (var i = 0; i + 1 < leaves.length; i++) leaves[i].next = leaves[i + 1].id;
    pages = pages.concat(leaves);
    var level = leaves;
    while (level.length > 1) {
      level = chunk(level, fanout).map(function (kids) {
        var node = { id: next++, leaf: false, children: kids.map(function (k) { return k.id; }), keys: [], kids: kids };
        node.keys = kids.slice(1).map(function (k) { return minKey(k); });
        return node;
      });
      pages = pages.concat(level);
    }
    var byId = {}; pages.forEach(function (p) { byId[p.id] = p; });
    return { pages: pages, byId: byId, root: level.length ? level[0].id : null, leaves: leaves };
  }
  function minKey(p) { return p.leaf ? p.keys[0] : minKey(p.kids[0]); }

  // ChildFor: the last separator <= key picks the child (child 0 if none is).
  function childIndex(node, key) {
    var found = 0;
    for (var i = 0; i < node.keys.length; i++) if (node.keys[i] <= key) found = i + 1;
    return found;
  }
  function lowerBound(keys, key) { var i = 0; while (i < keys.length && keys[i] < key) i++; return i; }

  // Each frame: line (the pseudocode line to light), text, page being read, and the iterator's state.
  var CODE = [
    "BeginRange(lower, upper):",
    "  page = root",
    "  while page is internal:",
    "    page = ChildFor(page, lower)  // last sep <= lower",
    "  index = lower_bound(page.keys, lower)",
    "  Take(page, index)   // copy keys below upper, note next",
    "  Settle()",
    "",
    "Settle():",
    "  while pos >= keys.size():",
    "    if next == INVALID: finish  // range or chain ended",
    "    Take(fetch(next), 0)        // follow the sibling link",
    "",
    "for (it = BeginRange(..); !it.IsEnd(); ++it):",
    "  emit *it                      // ++it: pos++, Settle()",
  ];
  function trace(tree, lower, upper) {
    var frames = [], reads = 0, emitted = [];
    var it = { keys: [], pos: 0, leaf: null, next: null, end: false };
    function push(line, text, page, extra) {
      frames.push(Object.assign({ line: line, text: text, page: page == null ? null : page, reads: reads, emitted: emitted.slice(),
        it: { keys: it.keys.slice(), pos: it.pos, leaf: it.leaf, next: it.next, end: it.end } }, extra || {}));
    }
    if (tree.root == null) { push(1, "The tree is empty: there is no root, so the range is empty.", null); return frames; }
    var page = tree.byId[tree.root];
    reads++;
    push(1, "Start at the root, page " + page.id + ". One page read.", page.id);
    while (!page.leaf) {
      var idx = childIndex(page, lower);
      var why = idx === 0 ? "no separator is <= " + lower + ", so take the leftmost child"
        : "the last separator <= " + lower + " is " + page.keys[idx - 1] + ", so take child " + idx;
      var child = tree.byId[page.children[idx]];
      push(3, "ChildFor(page " + page.id + ", " + lower + "): " + why + ": page " + child.id + ".", page.id, { choose: child.id });
      page = child; reads++;
      push(2, "Read page " + page.id + (page.leaf ? ", a leaf." : ", an internal page."), page.id);
    }
    var index = lowerBound(page.keys, lower);
    push(4, "lower_bound in leaf " + page.id + " for " + lower + " is index " + index + (index < page.keys.length ? " (key " + page.keys[index] + ")." : ": every key here is smaller, so the scan starts at the next leaf."), page.id, { from: index });
    function take(p, from, line) {
      it.keys = []; it.pos = 0; it.leaf = p.id; it.next = p.next;
      var cut = false;
      for (var i = from; i < p.keys.length; i++) {
        if (p.keys[i] >= upper) { it.next = null; cut = true; break; }
        it.keys.push(p.keys[i]);
      }
      push(line, "Take(page " + p.id + ", " + from + "): copy " + (it.keys.length ? "keys " + it.keys.join(", ") : "no keys") +
        (cut ? "; a key >= " + upper + " is next, so next = INVALID and the scan ends after this leaf" : p.next != null ? "; remember next = page " + p.next : "; this is the last leaf, so next = INVALID") + ". The page is released.", p.id, { take: it.keys.slice() });
    }
    take(page, index, 5);
    function settle() {
      push(6, it.keys.length > it.pos ? "Settle: pos " + it.pos + " < " + it.keys.length + ", so there is a key to give." : "Settle: pos " + it.pos + " >= " + it.keys.length + ", the copied keys are used up.", it.leaf);
      while (!it.end && it.pos >= it.keys.length) {
        if (it.next == null) { it.end = true; push(10, "next == INVALID: the iterator is at its end.", it.leaf); return; }
        var p = tree.byId[it.next]; reads++;
        push(11, "Follow the sibling link from page " + it.leaf + " to page " + p.id + ". One more page read, and no climb back to the root.", p.id, { link: [it.leaf, p.id] });
        take(p, 0, 11);
      }
    }
    settle();
    while (!it.end) {
      var k = it.keys[it.pos];
      emitted.push(k);
      push(14, "Emit " + k + ".", it.leaf, { emit: k });
      it.pos++;
      push(14, "++it: pos becomes " + it.pos + ", then Settle.", it.leaf);
      settle();
    }
    push(14, "Done: " + emitted.length + " key" + (emitted.length === 1 ? "" : "s") + " in " + reads + " page read" + (reads === 1 ? "" : "s") + ", counting the descent and every leaf visited.", it.leaf, { done: true });
    return frames;
  }
  var api = { build: build, trace: trace, CODE: CODE, childIndex: childIndex, lowerBound: lowerBound };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.BTS = api;
})(typeof window !== "undefined" ? window : globalThis);
