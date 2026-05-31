"""
agents/voc_analyzer.py — Sub-Agent 3: Voice of Customer Analyzer
Extracts pain points, desires, and sentiment from forums, reviews, and social discussions.
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
from tools.self_learning import load_weights

logger = logging.getLogger(__name__)


@dataclass
class VOCReport:
    pain_points: list[str]
    desires: list[str]
    sentiment_score: float          # 0.0 = all negative, 1.0 = all positive
    sentiment_label: str            # "Positive" / "Neutral" / "Negative"
    top_phrases: list[str]
    sentiment_delta: Optional[float]
    sample_snippets: list[str]
    timestamp: str


# ─── NLP Helpers ─────────────────────────────────────────────────────────────

PAIN_INDICATORS = [
    r"(?:hate|hated|dislike|problem with|issue with|broken|doesn't work|"
    r"stopped working|terrible|awful|worst|annoying|frustrated|disappointed|"
    r"return|refund|waste of money|not worth|overpriced|cheap|flimsy|avoid|"
    r"regret|fail|failed|scam|fake)[^.!?]{0,80}",
]

DESIRE_INDICATORS = [
    r"(?:wish|want|need|hope|would love|looking for|if only|should have|"
    r"better if|please add|feature request|would be nice|expect|require|"
    r"missing|lacks|needs more|upgrade|improve)[^.!?]{0,80}",
]


def _extract_phrases(text: str, patterns: list[str]) -> list[str]:
    found = []
    for pat in patterns:
        matches = re.findall(pat, text, re.IGNORECASE)
        found.extend(m.strip()[:100] for m in matches)
    return found


def _sentiment_ratio(text: str) -> float:
    """Returns a 0.0–1.0 score where 1.0 = fully positive."""
    words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
    pos = sum(1 for w in words if w in config.POSITIVE_WORDS)
    neg = sum(1 for w in words if w in config.NEGATIVE_WORDS)
    total = pos + neg
    if total == 0:
        return 0.5
    return round(pos / total, 3)


def _top_ngrams(text: str, n: int = 12) -> list[str]:
    """Extract top meaningful unigrams and bigrams by frequency."""
    words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    filtered = [w for w in words if w not in config.STOPWORDS]
    bigrams = [f"{filtered[i]} {filtered[i+1]}" for i in range(len(filtered) - 1)]
    counter = Counter(filtered + bigrams)
    return [term for term, _ in counter.most_common(n)]


def _label(score: float) -> str:
    if score >= 0.60:
        return "Positive"
    elif score >= 0.40:
        return "Neutral"
    return "Negative"


# ─── Main Agent Function ──────────────────────────────────────────────────────

def run() -> VOCReport:
    """Execute a full Voice-of-Customer analysis cycle."""
    weights    = load_weights()
    src_weight = weights.get("reddit_search", 1.0)

    all_text:     list[str] = []
    all_snippets: list[str] = []
    pain_points:  list[str] = []
    desires:      list[str] = []

    logger.info("[VOCAnalyzer] Starting customer voice extraction")

    for query in config.VOC_SEARCH_QUERIES:
        results = web_search.search(query, source_tag="reddit_search")
        for r in results:
            combined = f"{r.title}. {r.snippet}"
            all_text.append(combined)
            all_snippets.append(combined[:160])

            pain_points.extend(_extract_phrases(combined, PAIN_INDICATORS))
            desires.extend(_extract_phrases(combined, DESIRE_INDICATORS))

    # Deduplicate and trim
    pain_points = list(dict.fromkeys(pain_points))[:10]
    desires     = list(dict.fromkeys(desires))[:10]

    # If regex didn't catch enough, fall back to high-frequency negative/desire words
    if len(pain_points) < 3:
        full_text   = " ".join(all_text)
        neg_words   = [w for w in re.findall(r'\b[a-zA-Z]+\b', full_text.lower())
                       if w in config.NEGATIVE_WORDS]
        neg_counter = Counter(neg_words).most_common(5)
        pain_points += [f"Frequent complaint keyword: '{w}' (×{c})" for w, c in neg_counter]

    # Sentiment analysis
    full_corpus   = " ".join(all_text)
    sentiment     = _sentiment_ratio(full_corpus)
    top_phrases   = _top_ngrams(full_corpus, n=12)

    # Compare with previous cycle
    history       = kb.get_recent_voc(limit=1)
    prev_sent     = history[0]["sentiment"] if history else None
    sent_delta    = round(sentiment - prev_sent, 3) if prev_sent is not None else None

    # Persist
    kb.store_voc(pain_points, desires, sentiment)

    logger.info(
        "[VOCAnalyzer] Done. Sentiment=%.2f (%s), pain=%d, desires=%d",
        sentiment, _label(sentiment), len(pain_points), len(desires)
    )

    return VOCReport(
        pain_points=pain_points,
        desires=desires,
        sentiment_score=sentiment,
        sentiment_label=_label(sentiment),
        top_phrases=top_phrases,
        sentiment_delta=sent_delta,
        sample_snippets=all_snippets[:5],
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
