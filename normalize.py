#!/usr/bin/env python3
"""Give a built manual the same structure as its siblings. Idempotent; each manual's build.py calls it last.

    python3 normalize.py [dir]

For every content page (one with a sidebar): a search box and search.js, an "On this page" list when there are three or
more sections, previous and next links in sidebar order, and one title format ("Page — Project"). It also writes
search-index.json from every page, home page included. Copies of this file and search.js live in each manual repo.
"""

import html
import json
import re
import sys
from pathlib import Path

SEARCH = (
    '<input class="search" id="q" type="search" placeholder="Search the manual" autocomplete="off">'
    '<ul id="results" hidden></ul>'
)
PAGER_CSS_MARK = ".pager"


def text_of(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def slug(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "section"
    return "s-" + s if s[0].isdigit() else s  # an id must start with a letter


def nav_pages(page: str) -> list[tuple[str, str]]:
    nav = re.search(r'<nav class="nav"[^>]*>(.*?)</nav>', page, re.S)
    if not nav:
        return []
    return [(h, text_of(t)) for h, t in re.findall(r'<a href="([\w-]+\.html)"[^>]*>(.*?)</a>', nav.group(1), re.S) if "brand-desk" not in t]


def tidy(page: str) -> str:
    """Markup fixes every page gets: labelled landmarks, table scopes and bodies, valid ids, button types."""
    for cls, label in (("site", "Site"), ("nav", "Manual pages"), ("toc", "On this page")):
        page = re.sub(rf'<nav class="{cls}"(?![^>]*aria-label)', f'<nav class="{cls}" aria-label="{label}"', page)
    # a callout is a note, not a landmark
    page = re.sub(r'<aside class="callout([^"]*)">(.*?)</aside>', r'<div class="callout\1" role="note">\2</div>', page, flags=re.S)
    page = re.sub(r'<th(?=[\s>])(?![^>]*\bscope=)([^>]*)>', r'<th scope="col"\1>', page)
    page = re.sub(r"<button(?![^>]*\btype=)", '<button type="button"', page)
    page = re.sub(r'<div(?![^>]*\brole=)([^>]*\baria-label="[^"]*"[^>]*)>', r'<div role="group"\1>', page)
    # ids must start with a letter: "1-the-log" becomes "s-1-the-log", and links to it follow
    for m in set(re.findall(r'\bid="(\d[^"]*)"', page)):
        page = page.replace(f'id="{m}"', f'id="s-{m}"').replace(f'href="#{m}"', f'href="#s-{m}"')
    # a table whose rows are not in a body gets one (the first row of header cells becomes the head)
    def wrap(m):
        table = m.group(0)
        if "<tbody" in table:
            return table
        head = re.match(r"(<table[^>]*>)\s*(<thead>.*?</thead>)?(.*)(</table>)", table, re.S)
        open_, thead, rows, close = head.groups()
        if not thead:
            first = re.match(r"\s*(<tr>(?:\s*<th[^>]*>.*?</th>)+\s*</tr>)(.*)", rows, re.S)
            if first:
                thead, rows = "<thead>" + first.group(1) + "</thead>", first.group(2)
        return f"{open_}{thead or ''}<tbody>{rows}</tbody>{close}"

    return re.sub(r"<table[^>]*>.*?</table>", wrap, page, flags=re.S)


def run(root) -> None:
    root = Path(root)
    files = sorted(root.glob("*.html"))
    order: list[tuple[str, str]] = []
    for f in files:
        order = nav_pages(f.read_text())
        if order:
            break
    index = []
    for f in files:
        page = f.read_text()
        main = re.search(r"<main[^>]*id=\"content\"[^>]*>(.*?)</main>", page, re.S)
        if not main:
            continue
        page = tidy(page)
        f.write_text(page)
        has_nav = '<nav class="nav"' in page
        if has_nav:
            page = tidy(fix_content_page(page, f.name, order))
            f.write_text(page)
            main = re.search(r"<main[^>]*id=\"content\"[^>]*>(.*?)</main>", page, re.S)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", main.group(1), re.S)
        title = text_of(h1.group(1)) if h1 else text_of(re.search(r"<title>(.*?)</title>", page, re.S).group(1))
        index.append({"title": title, "url": f.name, "text": text_of(main.group(1))[:4000]})
    (root / "search-index.json").write_text(json.dumps(index))
    print(f"normalize: {len(index)} pages indexed in {root.name}")


def fix_content_page(page: str, name: str, order: list[tuple[str, str]]) -> str:
    # one title format
    page = re.sub(r"<title>(.*?) - (.*?)</title>", r"<title>\1 — \2</title>", page, count=1)
    # search
    if 'id="q"' not in page:
        page = re.sub(r'(<nav class="nav"[^>]*>\s*(?:<a class="brand-desk"[^>]*>.*?</a>)?)', lambda m: m.group(1) + SEARCH, page, count=1, flags=re.S)
    if "search.js" not in page:
        page = page.replace("</body>", '<script src="search.js"></script>\n</body>')
    # sections get ids, and an "On this page" list when there are enough of them
    def add_id(m):
        return m.group(0) if "id=" in m.group(1) else f'<h2 id="{slug(text_of(m.group(2)))}"{m.group(1)}>{m.group(2)}</h2>'

    page = re.sub(r"<h2([^>]*)>(.*?)</h2>", add_id, page, flags=re.S)
    heads = re.findall(r'<h2[^>]*id="([^"]+)"[^>]*>(.*?)</h2>', page, re.S)
    if len(heads) >= 3 and 'class="toc"' not in page:
        items = "".join(f'<li><a href="#{i}">{text_of(t)}</a></li>' for i, t in heads)
        toc = f'<nav class="toc" aria-label="On this page"><strong>On this page</strong><ol>{items}</ol></nav>'
        page = re.sub(r'(<p class="lede">.*?</p>)', lambda m: m.group(1) + "\n" + toc, page, count=1, flags=re.S)
    # previous and next
    page = re.sub(r'\s*<nav class="pager".*?</nav>', "", page, flags=re.S)
    names = [h for h, _ in order]
    if name in names:
        i = names.index(name)
        prev = f'<a class="prev" href="{order[i - 1][0]}"><span>Previous</span>{html.escape(order[i - 1][1])}</a>' if i > 0 else "<span></span>"
        nxt = f'<a class="next" href="{order[i + 1][0]}"><span>Next</span>{html.escape(order[i + 1][1])}</a>' if i + 1 < len(order) else "<span></span>"
        page = page.replace("</main>", f'<nav class="pager" aria-label="Pages">{prev}{nxt}</nav>\n</main>', 1)
    return page


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else ".")
