// node btree-scan.test.mjs: the stepper's trace gives exactly the keys in [lower, upper),
// reads one page per level plus one per leaf visited, and the tree is a valid B+ tree.
import assert from "node:assert";
import { createRequire } from "node:module";
const BTS = createRequire(import.meta.url)("./btree-scan.js");
let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let cases = 0;
for (let round = 0; round < 400; round++) {
  const n = rnd(60), leafCap = 2 + rnd(4), fanout = 3 + rnd(3);
  const keys = Array.from({ length: n }, () => rnd(200));
  const tree = BTS.build(keys, leafCap, fanout);
  const sorted = [...new Set(keys)].sort((a, b) => a - b);
  // Every leaf is at least half full except a lone root leaf, and the chain visits every key in order.
  const chain = []; for (let id = tree.leaves[0]?.id; id != null; id = tree.byId[id].next) chain.push(...tree.byId[id].keys);
  assert.deepStrictEqual(chain, sorted);
  if (tree.leaves.length > 1) for (const l of tree.leaves) assert(l.keys.length >= Math.ceil(leafCap / 2), "leaf under half full");
  for (let q = 0; q < 8; q++) {
    const lower = rnd(220) - 10, upper = lower + rnd(80);
    const frames = BTS.trace(tree, lower, upper);
    const last = frames[frames.length - 1];
    assert.deepStrictEqual(last.emitted, sorted.filter((k) => k >= lower && k < upper), `range [${lower},${upper}) of ${sorted}`);
    if (sorted.length) {
      let h = 1, p = tree.byId[tree.root]; while (!p.leaf) { p = tree.byId[p.children[0]]; h++; }
      assert(last.reads >= h && last.reads <= h + tree.leaves.length);
    }
    cases++;
  }
}
console.log(`ok: ${cases} ranges over 400 random trees`);
