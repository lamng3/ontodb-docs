// Shared playground helpers for the manuals: a SPARQL engine in the browser (Oxigraph, WebAssembly), data saved in
// IndexedDB, result tables, and an optional connection to a language model you run yourself (Ollama or any
// OpenAI-compatible endpoint). Nothing here talks to a server of ours; there is no server.
const PG = (() => {
  const OXIGRAPH = "https://cdn.jsdelivr.net/npm/oxigraph@0.5.12/web.js";
  let engine;
  const load = () => (engine ||= import(OXIGRAPH).then(async (ox) => { await ox.default(); return ox; }));

  // ---- storage: the store is kept as N-Quads in IndexedDB, per playground name ----
  const idb = (mode, fn) => new Promise((resolve, reject) => {
    const open = indexedDB.open("manual-playgrounds", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("stores");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("stores", mode), req = fn(tx.objectStore("stores"));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
  const saved = (name) => idb("readonly", (s) => s.get(name)).catch(() => undefined);
  const keep = (name, text) => idb("readwrite", (s) => s.put(text, name)).catch(() => undefined);

  // A store that survives a reload. `seed` is [{text, format}] loaded when nothing is saved yet.
  async function openStore(name, seed = []) {
    const ox = await load(), store = new ox.Store();
    const previous = await saved(name);
    if (previous) { store.load(previous, { format: "application/n-quads" }); }
    else for (const s of seed) store.load(s.text, { format: s.format || "text/turtle", base_iri: s.base });
    const handle = {
      store, ox, restored: !!previous,
      async save() { await keep(name, store.dump({ format: "application/n-quads" })); },
      async reset(newSeed = seed) { store.update("DROP ALL"); for (const s of newSeed) store.load(s.text, { format: s.format || "text/turtle", base_iri: s.base }); await handle.save(); },
    };
    if (!previous) await handle.save();
    return handle;
  }

  // ---- terms and results ----
  const PREFIXES = {
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf:", "http://www.w3.org/2000/01/rdf-schema#": "rdfs:", "http://www.w3.org/2002/07/owl#": "owl:",
    "http://www.w3.org/2001/XMLSchema#": "xsd:", "http://xmlns.com/foaf/0.1/": "foaf:", "http://purl.org/dc/terms/": "dct:",
  };
  function short(iri, prefixes = {}) {
    for (const [ns, p] of Object.entries({ ...PREFIXES, ...prefixes })) if (iri.startsWith(ns) && iri.length > ns.length) return p + iri.slice(ns.length);
    return iri;
  }
  function term(t, prefixes) {
    if (!t) return { text: "", kind: "unbound" };
    if (t.termType === "NamedNode") return { text: short(t.value, prefixes), kind: "iri", full: t.value };
    if (t.termType === "BlankNode") return { text: "_:" + t.value, kind: "blank" };
    if (t.termType === "Literal") {
      const tail = t.language ? "@" + t.language : t.datatype && t.datatype.value !== "http://www.w3.org/2001/XMLSchema#string" ? "^^" + short(t.datatype.value, prefixes) : "";
      return { text: '"' + t.value + '"' + tail, kind: "literal" };
    }
    return { text: String(t.value ?? t), kind: "other" };
  }

  // Run a query or update. Returns {kind, vars, rows (arrays of terms), boolean, ms} or throws the engine's message.
  function run(store, text, prefixes) {
    const started = performance.now(), isUpdate = /^\s*(?:(?:PREFIX|BASE)[^\n]*\n\s*)*(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|COPY|MOVE|ADD|WITH)\b/i.test(text);
    if (isUpdate) { const before = store.size; store.update(text); return { kind: "update", changed: store.size - before, size: store.size, ms: performance.now() - started }; }
    const result = store.query(text), ms = performance.now() - started;
    if (typeof result === "boolean") return { kind: "ask", boolean: result, ms };
    if (typeof result === "string") return { kind: "text", text: result, ms };
    if (result.length && result[0].subject) { // CONSTRUCT / DESCRIBE: quads
      return { kind: "graph", vars: ["subject", "predicate", "object"], rows: result.map((q) => [term(q.subject, prefixes), term(q.predicate, prefixes), term(q.object, prefixes)]), ms };
    }
    const vars = result.length ? [...result[0].keys()] : (/SELECT\s+(?:DISTINCT\s+|REDUCED\s+)?((?:\?\w+\s*)+)/i.exec(text)?.[1].match(/\?\w+/g) || []).map((v) => v.slice(1));
    return { kind: "select", vars, rows: result.map((m) => vars.map((v) => term(m.get(v), prefixes))), ms };
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v != null && v !== false) el.setAttribute(k, v === true ? "" : v); }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }

  // Draw a result into `el`: a table for rows, a line for the rest, and a count with the time.
  function show(el, r, { limit = 500 } = {}) {
    el.replaceChildren();
    if (r.kind === "ask") return el.append(h("p", { class: "pg-line" }, "Answer: ", h("b", { text: String(r.boolean) }), ` · ${r.ms.toFixed(1)} ms`));
    if (r.kind === "update") return el.append(h("p", { class: "pg-line" }, `Update applied: ${r.changed >= 0 ? "+" : ""}${r.changed} triples, ${r.size.toLocaleString()} in the store · ${r.ms.toFixed(1)} ms`));
    if (r.kind === "text") return el.append(h("pre", { class: "pg-pre", text: r.text }));
    const shown = r.rows.slice(0, limit);
    const table = h("table", { class: "pg-table" },
      h("thead", {}, h("tr", {}, r.vars.map((v) => h("th", { scope: "col", text: "?" + v })))),
      h("tbody", {}, shown.map((row) => h("tr", {}, row.map((t) => h("td", { class: "pg-" + t.kind, title: t.full || null, text: t.text }))))));
    el.append(h("div", { class: "pg-scroll" }, r.rows.length ? table : null),
      h("p", { class: "pg-line" }, `${r.rows.length.toLocaleString()} ${r.rows.length === 1 ? "row" : "rows"}${r.rows.length > limit ? ` (first ${limit} shown)` : ""} · ${r.ms.toFixed(1)} ms`));
  }

  // ---- a language model you run yourself ----
  const LLM_KEY = "pg:llm";
  const llmConfig = () => { try { return { base: "http://localhost:11434/v1", model: "llama3.1", key: "", ...JSON.parse(localStorage.getItem(LLM_KEY) || "{}") }; } catch { return { base: "http://localhost:11434/v1", model: "llama3.1", key: "" }; } };
  async function chat(messages, { temperature = 0 } = {}) {
    const c = llmConfig();
    const res = await fetch(c.base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", ...(c.key ? { Authorization: "Bearer " + c.key } : {}) },
      body: JSON.stringify({ model: c.model, messages, temperature, stream: false }),
    });
    if (!res.ok) throw new Error(`The model endpoint answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).choices[0].message.content;
  }
  // A small form for the endpoint. Settings stay in this browser's localStorage and go only to the endpoint you name.
  function llmPanel(el, { onChange } = {}) {
    const c = llmConfig(), field = (id, label, value, type = "text", ph = "") => h("label", { class: "pg-field", for: id }, label, h("input", { id, type, value, placeholder: ph, autocomplete: "off" }));
    const base = field("llm-base", "Endpoint", c.base, "text", "http://localhost:11434/v1"), model = field("llm-model", "Model", c.model), key = field("llm-key", "API key (optional)", c.key, "password");
    const status = h("span", { class: "pg-status" });
    const save = () => { localStorage.setItem(LLM_KEY, JSON.stringify({ base: base.querySelector("input").value.trim(), model: model.querySelector("input").value.trim(), key: key.querySelector("input").value })); onChange && onChange(); };
    [base, model, key].forEach((f) => f.querySelector("input").addEventListener("change", save));
    const test = h("button", { type: "button", class: "btn", onclick: async () => { save(); status.textContent = "asking…"; try { const t0 = performance.now(); await chat([{ role: "user", content: "Reply with the single word: ready" }]); status.textContent = `reachable (${Math.round(performance.now() - t0)} ms)`; } catch (e) { status.textContent = "not reachable: " + (e.message || e); } } }, "Test the connection");
    el.replaceChildren(h("div", { class: "pg-llm" }, base, model, key), h("p", { class: "pg-line" }, test, " ", status),
      h("p", { class: "pg-note" }, "The endpoint is yours: with Ollama, run ", h("code", { text: 'OLLAMA_ORIGINS="*" ollama serve' }), " so a web page may call it. Settings stay in this browser and are sent only to that endpoint."));
  }

  return { load, openStore, run, show, short, term, h, chat, llmPanel, llmConfig };
})();
