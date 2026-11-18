#!/usr/bin/env python3
"""Inline styles, engine, interface and data into one page.

  dist/dinner-deck.html  the page body as published to Claude as an artifact (no doctype; the host adds it)
  dist/index.html        the same page as a complete document, for opening from disk or any static host
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

engine = re.sub(r"^export ", "", (SRC / "engine.js").read_text(encoding="utf-8"), flags=re.M)
ui = re.sub(r"^import .*?;\n", "", (SRC / "ui.js").read_text(encoding="utf-8"), count=1, flags=re.S)
deck = json.loads((ROOT / "data" / "deck.json").read_text(encoding="utf-8"))
data = json.dumps(deck, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

page = (SRC / "page.html").read_text(encoding="utf-8")
page = page.replace("/*CSS*/", (SRC / "styles.css").read_text(encoding="utf-8"))
page = page.replace("/*DATA*/", data)
page = page.replace("/*JS*/", engine + "\n" + ui)
assert "</script" not in engine + ui

dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
(dist / "dinner-deck.html").write_text(page, encoding="utf-8")
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        "<style>body{margin:0}[hidden]{display:none!important}</style></head><body>")
(dist / "index.html").write_text(head + page + "</body></html>", encoding="utf-8")
print(f"dist/dinner-deck.html {len(page.encode()):,} bytes")
