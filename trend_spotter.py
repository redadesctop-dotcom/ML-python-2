"""
agents/trend_spotter.py — Sub-Agent 1: Emerging Market Trend Detection
Scores trends by frequency × recency_decay × source_weight.
"""

import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from tools import web_search, knowledge_base as kb
from tools.self_learning import load_weights, get_top_keywords

logger = logging.getLogger(__name__)


@dataclass
class Trend:
    keyword: str
    score: float
    sources: list[str] = field(default_factory=list)
    confidence: float = 0.5
    snippets: list[str] = field(default_factory=list)


@dataclass
class TrendReport:
    trends: list[Trend]
    top_keywords_used: list[str]
    confidence: float
    timestamp: str
    prediction_ids: list[int] = field(default_factory=list)


def _extract_bigrams(text: str) -> list[str]:
    """Extract meaningful single words and bigrams from text, excluding stopwords."""
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    filtered = [w for w in words if w not in config.STOPWORDS]
    bigrams = [f"{filtered[i]} {filtered[i+1]}" for i in range(len(filtered)-1)]
    return filtered + bigrams


def _recency_decay(date_str: Optional[str] = None) -> float:
    """Assign recency weight: recent results score higher."""
    if not date_str:
        return 0.7   # unknown date = moderate weight
    # simple heuristic: if "hour" or "minute" in date → very recent
    dl = date_str.lower()
    if any(x in dl for x in ["minute", "hour", "today"]):
        return 1.0
    if "day" in dl:
        return 0.85
    if "week" in dl:
        return 0.65
    return 0.5



def run(domain: str = None) -> TrendReport:
    """
    Execute a full trend detection cycle.

    Returns:
        TrendReport with scored, sorted trends.
    """
    domain = domain or config.MARKET_DOMAIN
    weights = load_weights()
    source_weight = weights.get("duckduckgo_web", 1.0)

    # Choose top keywords from self-learning weights
    keywords = get_top_keywords(n=6)
    logger.info("[TrendSpotter] Running with %d keywords: %s", len(keywords), keywords)

    term_scores: Counter = Counter()
    term_sources: dict[str, list[str]] = {}
    term_snippets: dict[str, list[str]] = {}

    for kw in keywords:
        results = web_search.search(
            f"{kw} {domain}",
            max_results=config.SEARCH_MAX_RESULTS,
            source_tag="duckduckgo_web",
        )
        for r in results:
            combined = f"{r.title} {r.snippet}"
            recency  = _recency_decay(r.date)
            terms    = _extract_bigrams(combined)

            for term in terms:
                score_delta = recency * source_weight
                term_scores[term] += score_delta
                term_sources.setdefault(term, [])
                term_snippets.setdefault(term, [])
                if r.url not in term_sources[term]:
                    term_sources[term].append(r.url)
                if r.snippet and r.snippet not in term_snippets[term]:
                    term_snippets[term].append(r.snippet[:120])

    # Filter: must appear across ≥ threshold unique sources
    min_sources = config.ALERT_THRESHOLDS["trend_velocity_min"]
    filtered = {
        term: score
        for term, score in term_scores.items()
        if len(term_sources.get(term, [])) >= min_sources
        and len(term.split()) <= 3   # single word or bigram only
        and not any(c.isdigit() for c in term)  # no numbers
    }

    # Sort by score
    sorted_terms = sorted(filtered.items(), key=lambda x: x[1], reverse=True)[:15]
    total_score  = sum(s for _, s in sorted_terms) or 1.0

    trends = []
    prediction_ids = []
    for term, score in sorted_terms:
        conf = min(score / total_score * 3.0, 1.0)
        t = Trend(
            keyword=term,
            score=round(score, 3),
            sources=term_sources.get(term, [])[:3],
            confidence=round(conf, 3),
            snippets=term_snippets.get(term, [])[:2],
        )
        trends.append(t)
        # Store prediction for self-learning
        pid = kb.store_prediction("trend_spotter", f"Rising trend: '{term}' (score={score:.2f})")
        prediction_ids.append(pid)

    # Persist to knowledge base
    kb.store_trends([
        {"keyword": t.keyword, "score": t.score, "sources": t.sources, "confidence": t.confidence}
        for t in trends
    ])

    avg_conf = round(sum(t.confidence for t in trends) / len(trends), 3) if trends else 0.0

    logger.info("[TrendSpotter] Found %d qualifying trends", len(trends))
    return TrendReport(
        trends=trends,
        top_keywords_used=keywords,
        confidence=avg_conf,
        timestamp=datetime.now(timezone.utc).isoformat(),
        prediction_ids=prediction_ids,
    )
