"""Web Search arm — real-time search for trends, competitors, and VoC signals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class SearchHit:
    title: str
    url: str
    snippet: str
    query: str


def web_search(query: str, max_results: int = 5) -> List[SearchHit]:
    """Run a web search via DuckDuckGo (no API key required)."""
    hits: List[SearchHit] = []
    backends = [_search_ddgs, _search_duckduckgo_legacy]
    for fn in backends:
        try:
            hits = fn(query, max_results)
            if hits:
                return hits
        except Exception:
            continue
    return hits


def _normalize_result(r: dict, query: str) -> SearchHit:
    return SearchHit(
        title=r.get("title") or "",
        url=r.get("href") or r.get("link") or r.get("url") or "",
        snippet=r.get("body") or r.get("snippet") or r.get("description") or "",
        query=query,
    )


def _search_ddgs(query: str, max_results: int) -> List[SearchHit]:
    try:
        from ddgs import DDGS
    except ImportError:
        raise ImportError("pip install ddgs")
    hits = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=max_results):
            hits.append(_normalize_result(r, query))
    return hits


def _search_duckduckgo_legacy(query: str, max_results: int) -> List[SearchHit]:
    from duckduckgo_search import DDGS

    hits = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=max_results):
            hits.append(_normalize_result(r, query))
    return hits


def format_hits_for_llm(hits: List[SearchHit]) -> str:
    lines = []
    for i, h in enumerate(hits, 1):
        lines.append(f"{i}. [{h.title}]({h.url})\n   {h.snippet[:400]}")
    return "\n".join(lines) if lines else "(no results)"
