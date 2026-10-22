// node intervals.test.mjs: intervals find exactly the descendants (brute force), on random DAGs and graphs with cycles.
import assert from "node:assert";
import { createRequire } from "node:module";
const IVL = createRequire(import.meta.url)("./intervals.js");
let seed = 11; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let checked = 0;
for (let round = 0; round < 300; round++) {
  const n = 1 + rnd(25), cyc = round % 3 === 0;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const ps = new Set();
    const count = rnd(4) === 0 ? 2 + rnd(2) : rnd(2);
    for (let k = 0; k < count; k++) { const p = cyc ? rnd(n) : (i ? rnd(i) : -1); if (p >= 0 && p !== i) ps.add("C" + p); }
    lines.push(`C${i}: ${[...ps].join(", ")}`);
  }
  const dag = IVL.parse(lines.join("\n"));
  const L = IVL.label(dag);
  // brute force over the original graph: u is below v if v is reachable from u by child -> parent edges
  const reach = (u) => { const seen = new Set([u]), st = [u]; while (st.length) for (const p of dag.parents[st.pop()]) if (!seen.has(p)) { seen.add(p); st.push(p); } return seen; };
  for (const v of dag.names) {
    const want = dag.names.filter((u) => reach(u).has(v)).sort();
    const got = IVL.under(L, L.of[v]).members.flatMap((c) => L.classes[c].members).sort();
    assert.deepStrictEqual(got, want, `under ${v} in\n${lines.join("\n")}`);
    checked++;
  }
  // size lemma: |I(c)| <= 1 + non-tree edges below c
  const nt = IVL.nonTree(L);
  L.classes.forEach((_, c) => {
    const below = new Set(IVL.under(L, c).members);
    const bound = 1 + nt.filter(([ch]) => below.has(ch)).length;
    assert(L.sets[c].length <= bound, `|I|=${L.sets[c].length} > ${bound}`);
  });
}
console.log(`ok: ${checked} class queries over 300 random hierarchies (a third with cycles)`);
