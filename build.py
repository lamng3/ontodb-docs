#!/usr/bin/env python3
"""Turn content/*.md into a static site at the repo root."""

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"

NAV = []


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
            label = {"today": "Today", "next": "Next", "read": "Read"}[kind]
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


def page_html(meta, body_html, toc, pages):
    nav = ['<a class="brand-desk" href="index.html">OntoDB</a>', '<input class="search" id="q" type="search" placeholder="Search notes" autocomplete="off">', '<ul id="results" hidden></ul>']
    for page in pages:
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
<title>{title} — OntoDB</title>
<meta name="description" content="{html.escape(meta.get("description", ""))}">
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
  <a class="brand" href="index.html">OntoDB</a>
  <label class="nav-button" for="nav-toggle">Menu</label>
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
<footer class="site">OntoDB study notes. A database management system for ontologies: RDF, SPARQL, B+ tree indexes, optimizer, write-ahead log, ARIES.</footer>
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
        body_html, toc = render_body(body)
        text = re.sub(r"<[^>]+>", " ", body_html)
        text = re.sub(r"\s+", " ", html.unescape(text)).strip()
        pages.append(meta)
        rendered.append((meta, body_html, toc))
        index.append({"title": meta["title"], "url": meta["slug"] + ".html", "text": text[:4000]})
    pages.sort(key=lambda m: int(m["order"]))
    rendered.sort(key=lambda item: int(item[0]["order"]))
    for meta, body_html, toc in rendered:
        out = ROOT / f"{meta['slug']}.html"
        out.write_text(page_html(meta, body_html, toc, pages))
        print("wrote", out.name)
    (ROOT / "search-index.json").write_text(json.dumps(index))
    print("pages", len(rendered))


if __name__ == "__main__":
    main()
