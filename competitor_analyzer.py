"""
agents/competitor_analyzer.py — Sub-Agent 2: Competitor Monitoring
Tracks pricing signals, product launches, promo offers, and review sentiment per competitor.
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
class CompetitorProfile:
    name: str
    price_signals: list[str]
    new_products: list[str]
    promo_signals: list[str]
    sentiment_score: float          # 0.0 (negative) to 1.0 (positive), 0.5 neutral
    top_snippets: list[str]
    sources_used: list[str]
    prev_sentiment: Optional[float] = None
    sentiment_delta: Optional[float] = None


@dataclass
class CompetitorReport:
    profiles: list[CompetitorProfile]
    alerts: list[str]
    timestamp: str


# ─── Extraction helpers ───────────────────────────────────────────────────────

PRICE_PATTERNS = [
    r'\$[\d,]+(?:\.\d{2})?',
    r'£[\d,]+(?:\.\d{2})?',
    r'€[\d,]+(?:\.\d{2})?',
    r'\d+\s*(?:USD|EUR|GBP)',
    r'(?:price|cost|from|only|starting at)\s+[\$£€]?[\d,.]+',
    r'(?:discount|off|save)\s+[\d]+\s*%',
]

PROMO_KEYWORDS = {
    "sale", "deal", "offer", "discount", "promo", "free shipping",
    "bundle", "limited time", "clearance", "flash sale", "coupon",
    "rebate", "cashback", "buy one", "bogo", "special price",
}

NEW_PRODUCT_KEYWORDS = {
    "launch", "new", "release", "announced", "unveil", "debut",
    "introducing", "upcoming", "available now", "just released",
    "pre-order", "coming soon", "reveal",
}


def _extract_price_signals(text: str) -> list[str]:
    signals = []
    for pat in PRICE_PATTERNS:
        found = re.findall(pat, text, re.IGNORECASE)
        signals.extend(found)
    return list(set(signals))[:5]


def _extract_promo_signals(text: str) -> list[str]:
    words = set(text.lower().split())
    matches = []
    for kw in PROMO_KEYWORDS:
        if kw in text.lower():
            # extract surrounding context
            idx = text.lower().find(kw)
            context = text[max(0, idx-20):idx+40].strip()
            matches.append(context)
    return list(set(matches))[:4]


def _extract_new_products(text: str) -> list[str]:
    matches = []
    for kw in NEW_PRODUCT_KEYWORDS:
        if kw in text.lower():
            idx = text.lower().find(kw)
            context = text[max(0, idx-10):idx+60].strip()
            matches.append(context)
    return list(set(matches))[:4]


def _sentiment_score(text: str) -> float:
    """Returns a 0.0–1.0 score where 1.0 = fully positive, 0.5 = neutral."""
    words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
    pos = sum(1 for w in words if w in config.POSITIVE_WORDS)
    neg = sum(1 for w in words if w in config.NEGATIVE_WORDS)
    total = pos + neg
    if total == 0:
        return 0.5
    return round(pos / total, 3)


# ─── Main agent function ──────────────────────────────────────────────────────

def run() -> CompetitorReport:
    """Execute competitor analysis for all configured competitors."""
    weights    = load_weights()
    src_weight = weights.get("competitor_search", 1.0)
    alerts     = []
    profiles   = []

    for comp in config.COMPETITORS:
        name         = comp["name"]
        search_terms = comp["search_terms"]

        all_snippets:  list[str] = []
        all_sources:   list[str] = []
        price_signals: list[str] = []
        promo_signals: list[str] = []
        new_products:  list[str] = []

        logger.info("[CompetitorAnalyzer] Scanning: %s", name)

        for term in search_terms:
            results = web_search.search(term, source_tag="competitor_search")
            for r in results:
                combined = f"{r.title}. {r.snippet}"
                all_snippets.append(combined[:150])
                all_sources.append(r.url)
                price_signals.extend(_extract_price_signals(combined))
                promo_signals.extend(_extract_promo_signals(combined))
                new_products.extend(_extract_new_products(combined))

        # Deduplicate
        price_signals = list(set(price_signals))[:5]
        promo_signals = list(set(promo_signals))[:4]
        new_products  = list(set(new_products))[:4]

        # Aggregate sentiment
        full_text  = " ".join(all_snippets)
        sentiment  = _sentiment_score(full_text)

        # Compare with previous snapshot
        history    = kb.get_competitor_history(name, limit=1)
        prev_sent  = history[0]["data"].get("sentiment_score") if history else None
        sent_delta = round(sentiment - prev_sent, 3) if prev_sent is not None else None

        # Alert on significant sentiment drop
        if sent_delta is not None:
            drop_pct = abs(sent_delta) * 100
            if sent_delta < 0 and drop_pct >= config.ALERT_THRESHOLDS["sentiment_drop_pct"]:
                level = "CRITICAL" if drop_pct >= config.ALERT_THRESHOLDS["sentiment_critical_pct"] else "WARNING"
                alerts.append(
                    f"[{level}] {name}: Sentiment dropped {drop_pct:.0f}% "
                    f"({prev_sent:.2f} → {sentiment:.2f})"
                )

        # Alert on promos or new launches
        if promo_signals:
            alerts.append(f"[INFO] {name}: Active promo detected — {promo_signals[0][:60]}")
        if new_products:
            alerts.append(f"[INFO] {name}: Product launch signal — {new_products[0][:60]}")

        profile = CompetitorProfile(
            name=name,
            price_signals=price_signals,
            new_products=new_products,
            promo_signals=promo_signals,
            sentiment_score=sentiment,
            top_snippets=all_snippets[:3],
            sources_used=list(set(all_sources))[:5],
            prev_sentiment=prev_sent,
            sentiment_delta=sent_delta,
        )

        # Persist to KB
        kb.store_competitor(name, {
            "price_signals": price_signals,
            "new_products": new_products,
            "promo_signals": promo_signals,
            "sentiment_score": sentiment,
            "top_snippets": all_snippets[:3],
        })
        profiles.append(profile)

    logger.info("[CompetitorAnalyzer] Done. %d profiles, %d alerts", len(profiles), len(alerts))
    return CompetitorReport(
        profiles=profiles,
        alerts=alerts,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
