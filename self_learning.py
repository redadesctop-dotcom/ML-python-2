"""
tools/self_learning.py — Self-Learning Feedback Loop
Compares predictions vs. outcomes, adjusts source weights, refines keywords.
"""

import json
import logging
import os
from typing import Optional

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from tools import knowledge_base as kb

logger = logging.getLogger(__name__)


# ─── Weight Persistence ───────────────────────────────────────────────────────

def load_weights() -> dict[str, float]:
    """Load source weights from disk, falling back to defaults."""
    os.makedirs(config.KNOWLEDGE_STORE_DIR, exist_ok=True)
    if os.path.exists(config.WEIGHTS_FILE):
        with open(config.WEIGHTS_FILE, "r") as f:
            return json.load(f)
    return dict(config.DEFAULT_SOURCE_WEIGHTS)


def save_weights(weights: dict[str, float]):
    os.makedirs(config.KNOWLEDGE_STORE_DIR, exist_ok=True)
    with open(config.WEIGHTS_FILE, "w") as f:
        json.dump(weights, f, indent=2)


# ─── Trend Keyword Weight Persistence ────────────────────────────────────────

KEYWORD_WEIGHTS_FILE = os.path.join(config.KNOWLEDGE_STORE_DIR, "keyword_weights.json")


def load_keyword_weights() -> dict[str, float]:
    if os.path.exists(KEYWORD_WEIGHTS_FILE):
        with open(KEYWORD_WEIGHTS_FILE, "r") as f:
            return json.load(f)
    return {kw: 1.0 for kw in config.TREND_KEYWORDS}


def save_keyword_weights(kw_weights: dict[str, float]):
    os.makedirs(config.KNOWLEDGE_STORE_DIR, exist_ok=True)
    with open(KEYWORD_WEIGHTS_FILE, "w") as f:
        json.dump(kw_weights, f, indent=2)


def get_top_keywords(n: int = 6) -> list[str]:
    """Return the top-N keywords by current weight for this cycle's Trend Spotter."""
    kw_weights = load_keyword_weights()
    sorted_kws = sorted(kw_weights.items(), key=lambda x: x[1], reverse=True)
    return [kw for kw, _ in sorted_kws[:n]]


# ─── Feedback Engine ──────────────────────────────────────────────────────────

def _clamp(value: float, lo: float = 0.1, hi: float = 3.0) -> float:
    return max(lo, min(hi, value))


def run_feedback_loop(
    trend_confirmed_keywords: list[str],
    trend_missed_keywords: list[str],
    competitor_sources_hit: list[str],
    sentiment_sources_accurate: list[str],
) -> dict:
    """
    Core self-learning step. Call this at the end of every intelligence cycle.

    Args:
        trend_confirmed_keywords:  Keywords that predicted a trend that was later confirmed.
        trend_missed_keywords:     Keywords that predicted a trend that did NOT materialise.
        competitor_sources_hit:    Sources that produced accurate competitor intel.
        sentiment_sources_accurate: Sources that produced accurate VOC sentiment.

    Returns:
        dict with updated weights and a summary of changes.
    """
    weights = load_weights()
    kw_weights = load_keyword_weights()
    changes = []
    cycle_count = kb.get_cycle_count()

    # ── 1. Only run meaningful learning from cycle 2 onward ──────────────────
    if cycle_count < 1:
        logger.info("Self-learning: skipping (cycle %d < 1)", cycle_count)
        return {
            "status": "skipped",
            "reason": "Insufficient history (need ≥ 1 previous cycle)",
            "cycle": cycle_count,
            "weights": weights,
        }

    BOOST  = 0.15   # reward multiplier
    PENALISE = 0.10  # penalty multiplier

    # ── 2. Adjust source weights ──────────────────────────────────────────────
    for src in competitor_sources_hit:
        if src in weights:
            old = weights[src]
            weights[src] = _clamp(old + BOOST)
            if weights[src] != old:
                kb.log_weight_change(src, old, weights[src], "competitor intel accurate")
                changes.append(f"↑ {src}: {old:.2f}→{weights[src]:.2f}")

    for src in sentiment_sources_accurate:
        if src in weights:
            old = weights[src]
            weights[src] = _clamp(old + BOOST * 0.8)
            if weights[src] != old:
                kb.log_weight_change(src, old, weights[src], "sentiment prediction accurate")
                changes.append(f"↑ {src}: {old:.2f}→{weights[src]:.2f}")

    # ── 3. Adjust keyword weights ─────────────────────────────────────────────
    for kw in trend_confirmed_keywords:
        if kw in kw_weights:
            old = kw_weights[kw]
            kw_weights[kw] = _clamp(old + BOOST)
            changes.append(f"↑ KW '{kw}': {old:.2f}→{kw_weights[kw]:.2f}")
        else:
            kw_weights[kw] = 1.0 + BOOST
            changes.append(f"+ KW '{kw}': NEW at {kw_weights[kw]:.2f}")

    for kw in trend_missed_keywords:
        if kw in kw_weights:
            old = kw_weights[kw]
            kw_weights[kw] = _clamp(old - PENALISE)
            changes.append(f"↓ KW '{kw}': {old:.2f}→{kw_weights[kw]:.2f}")

    # ── 4. Persist ────────────────────────────────────────────────────────────
    save_weights(weights)
    save_keyword_weights(kw_weights)

    summary = {
        "status": "applied",
        "cycle": cycle_count,
        "changes": changes,
        "weights": weights,
        "keyword_weights_top5": sorted(kw_weights.items(), key=lambda x: x[1], reverse=True)[:5],
    }
    logger.info("Self-learning applied %d changes", len(changes))
    return summary
