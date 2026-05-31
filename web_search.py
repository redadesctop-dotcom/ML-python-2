"""
tools/web_search.py — Real-time web search tool
Uses DuckDuckGo HTML scraping (no API key required).
Falls back to SerpAPI if SERP_API_KEY is configured.
"""

import time
import random
import logging
import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str
    source: str = "duckduckgo_web"
    date: Optional[str] = None


def _rate_limit():
    """Apply jitter-based rate limiting between requests."""
    lo, hi = config.SEARCH_RATE_LIMIT_DELAY
    delay = random.uniform(lo, hi)
    time.sleep(delay)


def _clean_text(text: str) -> str:
    """Strip excess whitespace and HTML artifacts."""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


# ─── DuckDuckGo Scraper ───────────────────────────────────────────────────────

DDG_URL = "https://html.duckduckgo.com/html/"

HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
]


def _search_duckduckgo(query: str, max_results: int) -> list[SearchResult]:
    """Scrape DuckDuckGo HTML search results."""
    results = []
    headers = dict(HEADERS)
    headers["User-Agent"] = random.choice(USER_AGENTS)
    try:
        resp = requests.post(
            DDG_URL,
            data={"q": query, "b": "", "kl": "us-en"},
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        for result in soup.select(".result")[:max_results]:
            title_el = result.select_one(".result__title a")
            snippet_el = result.select_one(".result__snippet")
            url_el = result.select_one(".result__url")

            if not title_el:
                continue

            title   = _clean_text(title_el.get_text())
            snippet = _clean_text(snippet_el.get_text()) if snippet_el else ""
            url     = title_el.get("href", "")
            date_el = result.select_one(".result__timestamp")
            date    = _clean_text(date_el.get_text()) if date_el else None

            # Filter out DuckDuckGo internal links
            if url.startswith("/") or "duckduckgo.com" in url:
                continue

            results.append(SearchResult(
                title=title,
                url=url,
                snippet=snippet,
                source="duckduckgo_web",
                date=date,
            ))

    except requests.RequestException as e:
        logger.warning(f"DuckDuckGo search failed for '{query}': {e}")

    return results


# ─── SerpAPI ─────────────────────────────────────────────────────────────────

def _search_serpapi(query: str, max_results: int) -> list[SearchResult]:
    """Use SerpAPI if a key is configured."""
    results = []
    try:
        resp = requests.get(
            "https://serpapi.com/search",
            params={
                "q": query,
                "api_key": config.SERP_API_KEY,
                "num": max_results,
                "hl": "en",
                "gl": "us",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("organic_results", [])[:max_results]:
            results.append(SearchResult(
                title=item.get("title", ""),
                url=item.get("link", ""),
                snippet=item.get("snippet", ""),
                source="serpapi",
                date=item.get("date"),
            ))
    except Exception as e:
        logger.warning(f"SerpAPI search failed for '{query}': {e}")

    return results


# ─── Public Interface ─────────────────────────────────────────────────────────

def search(query: str, max_results: int = None, source_tag: str = None) -> list[SearchResult]:
    """
    Perform a web search and return structured results.

    Args:
        query:       The search query string.
        max_results: Max number of results (defaults to config value).
        source_tag:  Override the 'source' field on results (for learning weights).

    Returns:
        List of SearchResult objects.
    """
    if max_results is None:
        max_results = config.SEARCH_MAX_RESULTS

    _rate_limit()

    if config.SERP_API_KEY:
        results = _search_serpapi(query, max_results)
        for r in results:
            r.source = source_tag or "serpapi"
    else:
        results = _search_duckduckgo(query, max_results)
        for r in results:
            r.source = source_tag or "duckduckgo_web"

    logger.debug(f"Search '{query}' → {len(results)} results")
    return results


def search_batch(queries: list[str], max_results_each: int = None) -> dict[str, list[SearchResult]]:
    """
    Run multiple searches sequentially (rate-limited).

    Returns:
        Dict mapping query → list of SearchResult.
    """
    output = {}
    for q in queries:
        output[q] = search(q, max_results=max_results_each)
    return output
