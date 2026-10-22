#!/usr/bin/env python3
"""Turn content/*.md into the OntoDB manual, a static site at the repo root.

Each page's front matter names its `part`. Parts appear in the navigation in
PARTS order, and pages within a part in `order`.
"""

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"

PARTS = ["Getting started", "Using OntoDB", "Reference", "Internals", "Project"]

CALLOUTS = {
    "today": "Status",
    "next": "Planned",
    "read": "Further reading",
    "note": "Note",
    "warning": "Warning",
}


def parse_front(text):
    if not text.startswith("---\n"):
        raise SystemExit("missing front matter")
    end = text.find("\n---\n", 4)
    meta = {}
    for line in text[4:end].splitlines():
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    body = text[end + 5 :]
    return meta, body


def inline(text):
    parts = re.split(r"(`[^`]+`)", text)
    out = []
    for part in parts:
        if part.startswith("`") and part.endswith("`"):
            out.append("<code>" + html.escape(part[1:-1]) + "</code>")
            continue
        escaped = html.escape(part)
        escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
        escaped = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)",
            lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>',
            escaped,
        )
        out.append(escaped)
    return "".join(out)


def render_body(md):
    lines = md.splitlines()
    html_parts = []
    toc = []
    i = 0

    def close_list(kind):
        if kind:
            html_parts.append(f"</{kind}>")
        return None

    list_kind = None
    para = []

    def flush_para():
        nonlocal para
        if para:
            html_parts.append("<p>" + inline(" ".join(para)) + "</p>")
            para = []

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            flush_para()
            list_kind = close_list(list_kind)
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            html_parts.append("<pre><code>" + html.escape("\n".join(buf)) + "</code></pre>")
            i += 1
            continue
        if line.startswith(":::"):
            flush_para()
            list_kind = close_list(list_kind)
            kind = line[3:].strip()
            buf = []
            i += 1
            while i < len(lines) and lines[i].strip() != ":::":
                buf.append(lines[i])
                i += 1
            label = CALLOUTS[kind]
            inner, _ = render_body("\n".join(buf))
            html_parts.append(
                f'<aside class="callout {kind}"><span class="label">{label}</span>{inner}</aside>'
            )
            i += 1
            continue
        if not line.strip():
            flush_para()
            list_kind = close_list(list_kind)
            i += 1
            continue
        heading = re.match(r"^(#{2,3}) (.+)$", line)
        if heading:
            flush_para()
            list_kind = close_list(list_kind)
            level = len(heading.group(1))
            title = heading.group(2).strip()
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
            if level == 2:
                toc.append((slug, title))
            html_parts.append(f"<h{level} id=\"{slug}\">{inline(title)}</h{level}>")
            i += 1
            continue
        if line.lstrip().startswith("<"):
            flush_para()
            list_kind = close_list(list_kind)
            html_parts.append(line)
            i += 1
            continue
        if line.startswith("|"):
            flush_para()
            list_kind = close_list(list_kind)
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                rows.append(cells)
                i += 1
            body_rows = [r for r in rows if not all(set(c) <= set("-: ") for c in r)]
            head, *tail = body_rows
            thead = "".join(f"<th>{inline(c)}</th>" for c in head)
            tbody = "".join(
                "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row) + "</tr>" for row in tail
            )
            html_parts.append(f"<table><thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody></table>")
            continue
        if line.startswith("- "):
            flush_para()
            if list_kind != "ul":
                list_kind = close_list(list_kind)
                html_parts.append("<ul>")
                list_kind = "ul"
            html_parts.append("<li>" + inline(line[2:].strip()) + "</li>")
            i += 1
            continue
        numbered = re.match(r"^\d+\. (.+)$", line)
        if numbered:
            flush_para()
            if list_kind != "ol":
                list_kind = close_list(list_kind)
                html_parts.append("<ol>")
                list_kind = "ol"
            html_parts.append("<li>" + inline(numbered.group(1).strip()) + "</li>")
            i += 1
            continue
        para.append(line.strip())
        i += 1
    flush_para()
    close_list(list_kind)
    return "".join(html_parts), toc


HEAD = """<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=TikTok+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">"""

HEADER = """<header class="site">
  <a class="logo" href="index.html"><span class="logo-mark">O</span><span>OntoDB</span></a>
  <nav class="site">
    <a href="install.html">Install</a>
    <a href="tutorial.html">Tutorial</a>
    <a href="sparql.html">SPARQL</a>
    <label class="nav-button" for="nav-toggle">Menu</label>
    <a href="https://github.com/lamng3/OntoDB" class="pill">GitHub ↗</a>
  </nav>
</header>"""

CARDS = [
    ("tutorial", "Tutorial", "Load an ontology, query it, update it, and restart the database."),
    ("sparql", "SPARQL", "What the query engine accepts, and how it is planned."),
    ("durability", "Write-ahead log", "Every transaction is logged before it is applied; recovery replays the log."),
    ("buffer-pool", "Buffer pool", "Pages, pins, and replacement, with a hit rate you can read."),
    ("optimizer", "Optimizer", "Join order from estimated rows, checked against actual rows."),
    ("recovery", "Recovery", "Crash the shell on purpose, then verify the database rebuilt from its log."),
]

HOME = """<section class="hero">
  <div>
    <h1>A database management system for ontologies</h1>
    <p class="lede">{lede}</p>
    <pre class="install"><span class="prompt">$ </span>brew install pkgconf raptor cmake ninja
<span class="prompt">$ </span>git clone https://github.com/lamng3/OntoDB.git &amp;&amp; cd OntoDB
<span class="prompt">$ </span>cmake --preset dev &amp;&amp; cmake --build --preset dev</pre>
    <div class="actions">
      <a class="btn solid" href="install.html">Get started</a>
      <a class="btn" href="tutorial.html">Tutorial</a>
      <a class="btn" href="sparql.html">SPARQL</a>
    </div>
  </div>
  <div class="demo-card" id="demo">
    <div class="head"><h3>Query a real database</h3><span class="tag">output of the <b>ontodb shell</b></span></div>
    <div class="tabs" id="tabs" role="tablist"></div>
    <p class="q" id="question"></p>
    <pre class="sparql" id="sparql"></pre>
    <div class="actions"><button class="btn solid" id="run">Run</button><button class="btn" id="explain">Explain analyze</button></div>
    <pre class="out" id="out" aria-live="polite">Press Run.</pre>
    <p class="note">Each query ran in the real shell on the Pizza ontology ({loaded}). The page shows what the shell printed, with IRI prefixes shortened. <code>\\explain analyze</code> prints each plan node with its estimated and actual rows.</p>
  </div>
</section>
<section class="block">
  <h2>What it does</h2>
  <p class="sub">RDF in, SPARQL out, with the machinery of a database underneath.</p>
  <div class="cards">{cards}</div>
</section>
<section class="block"><div class="prose-home">{body}</div></section>
<script src="demo.js"></script>"""


def home_html(meta, body_html):
    cards = "".join(
        f'<a class="card" href="{slug}.html"><strong>{html.escape(t)}</strong><span>{html.escape(d)}</span></a>'
        for slug, t, d in CARDS
    )
    loaded = json.loads((ROOT / "demo-data.json").read_text())["loaded"]
    hero = HOME.format(lede=inline(meta.get("lede", "")), cards=cards, body=body_html, loaded=loaded)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
{HEAD}
<title>OntoDB — a database management system for ontologies</title>
<meta name="description" content="{html.escape(meta.get("description", ""))}">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<input id="nav-toggle" class="nav-toggle" type="checkbox">
{HEADER}
<main class="wrap" id="content" style="max-width:1280px">
{hero}
</main>
<footer class="site">OntoDB by <a href="https://github.com/lamng3">Lam Nguyen</a> · a database management system for ontologies</footer>
</body>
</html>
"""


def page_html(meta, body_html, toc, pages):
    if meta["slug"] == "index":
        return home_html(meta, body_html)
    nav = [
        '<a class="brand-desk" href="index.html">OntoDB Manual</a>',
        '<input class="search" id="q" type="search" placeholder="Search the manual" autocomplete="off">',
        '<ul id="results" hidden></ul>',
    ]
    for part in PARTS:
        members = [page for page in pages if page["part"] == part]
        if not members:
            continue
        nav.append(f'<p class="nav-part">{html.escape(part)}</p>')
        for page in members:
            current = ' aria-current="page"' if page["slug"] == meta["slug"] else ""
            nav.append(f'<a href="{page["slug"]}.html"{current}>{html.escape(page["title"])}</a>')
    toc_html = ""
    if toc:
        items = "".join(f'<li><a href="#{slug}">{html.escape(title)}</a></li>' for slug, title in toc)
        toc_html = f'<nav class="toc"><strong>On this page</strong><ol>{items}</ol></nav>'
    title = html.escape(meta["title"])
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — OntoDB Manual</title>
<meta name="description" content="{html.escape(meta.get("description", ""))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=TikTok+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site">
  <a class="logo" href="index.html"><span class="logo-mark">O</span><span>OntoDB</span></a>
  <nav class="site">
    <a href="install.html">Install</a>
    <a href="tutorial.html">Tutorial</a>
    <a href="sparql.html">SPARQL</a>
    <label class="nav-button" for="nav-toggle">Menu</label>
    <a href="https://github.com/lamng3/OntoDB" class="pill">GitHub ↗</a>
  </nav>
</header>
<input id="nav-toggle" class="nav-toggle" type="checkbox">
<div class="layout">
<nav class="nav">
{"".join(nav)}
</nav>
<main id="content">
<p class="kicker">{html.escape(meta.get("kicker", ""))}</p>
<h1>{title}</h1>
<p class="lede">{inline(meta.get("lede", ""))}</p>
{toc_html}
{body_html}
</main>
</div>
<footer class="site">OntoDB Manual. OntoDB is a database management system for ontologies: RDF in, SPARQL queries, a write-ahead log, and recovery.</footer>
<script src="search.js"></script>
</body>
</html>
"""


def main():
    pages = []
    rendered = []
    index = []
    for path in sorted(CONTENT.glob("*.md")):
        meta, body = parse_front(path.read_text())
        if meta.get("part") not in PARTS:
            raise SystemExit(f"{path.name}: part must be one of {PARTS}")
        body_html, toc = render_body(body)
        text = re.sub(r"<[^>]+>", " ", body_html)
        text = re.sub(r"\s+", " ", html.unescape(text)).strip()
        pages.append(meta)
        rendered.append((meta, body_html, toc))
        index.append({"title": meta["title"], "url": meta["slug"] + ".html", "text": text[:4000]})
    rank = {part: i for i, part in enumerate(PARTS)}
    pages.sort(key=lambda m: (rank[m["part"]], int(m["order"])))
    rendered.sort(key=lambda item: (rank[item[0]["part"]], int(item[0]["order"])))
    for meta, body_html, toc in rendered:
        out = ROOT / f"{meta['slug']}.html"
        out.write_text(page_html(meta, body_html, toc, pages))
        print("wrote", out.name)
    (ROOT / "search-index.json").write_text(json.dumps(index))
    print("pages", len(rendered))


if __name__ == "__main__":
    main()
