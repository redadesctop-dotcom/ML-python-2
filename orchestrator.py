"""
orchestrator.py — Master coordinator for all sub-agents and tools.
Runs a full intelligence cycle and returns structured results.
"""

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config
from agents import trend_spotter, competitor_analyzer, voc_analyzer
from tools import knowledge_base as kb
from tools import self_learning
from alert_engine import evaluate as evaluate_alerts, Alert

logger = logging.getLogger(__name__)


@dataclass
class IntelligenceCycle:
    cycle_number: int
    timestamp: str
    trend_report: object
    competitor_report: object
    voc_report: object
    alerts: list[Alert]
    learning_summary: dict
    duration_seconds: float


def run_cycle() -> IntelligenceCycle:
    """
    Execute a full Market Intelligence cycle:
      1. Run all 3 sub-agents (concurrently via threads)
      2. Evaluate alerts
      3. Run self-learning feedback loop
      4. Log cycle to KB
      5. Return IntelligenceCycle result
    """
    start = datetime.now(timezone.utc)
    cycle_num = kb.get_cycle_count() + 1
    logger.info("=" * 60)
    logger.info("INTELLIGENCE CYCLE #%d — %s", cycle_num, start.isoformat())
    logger.info("=" * 60)

    # ── Concurrent agent execution via threads ────────────────────────────────
    results = {}
    errors  = {}

    def run_agent(name: str, fn):
        try:
            results[name] = fn()
        except Exception as e:
            logger.error("[Orchestrator] Agent '%s' failed: %s", name, e, exc_info=True)
            errors[name] = str(e)
            results[name] = None

    threads = [
        threading.Thread(target=run_agent, args=("trends",      trend_spotter.run),      daemon=True),
        threading.Thread(target=run_agent, args=("competitors", competitor_analyzer.run), daemon=True),
        threading.Thread(target=run_agent, args=("voc",         voc_analyzer.run),        daemon=True),
    ]

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=300)

    trend_report      = results.get("trends")
    competitor_report = results.get("competitors")
    voc_report        = results.get("voc")

    # ── Alert evaluation ──────────────────────────────────────────────────────
    alerts = evaluate_alerts(trend_report, competitor_report, voc_report)

    # ── Self-learning feedback ────────────────────────────────────────────────
    confirmed_kws = []
    missed_kws    = []
    if trend_report and trend_report.trends:
        # Heuristic: trends with conf > 0.7 are "confirmed", < 0.3 "missed"
        confirmed_kws = [t.keyword for t in trend_report.trends if t.confidence >= 0.7]
        missed_kws    = [t.keyword for t in trend_report.trends if t.confidence < 0.3]

    comp_sources_hit = []
    if competitor_report:
        # Heuristic: profiles with positive sentiment hit
        comp_sources_hit = ["competitor_search"] if any(
            p.sentiment_score > 0.4 for p in competitor_report.profiles
        ) else []

    sent_sources_ok = []
    if voc_report and voc_report.sentiment_score > 0.0:
        sent_sources_ok = ["reddit_search"]

    learning_summary = self_learning.run_feedback_loop(
        trend_confirmed_keywords=confirmed_kws,
        trend_missed_keywords=missed_kws,
        competitor_sources_hit=comp_sources_hit,
        sentiment_sources_accurate=sent_sources_ok,
    )

    # ── Log cycle to knowledge base ───────────────────────────────────────────
    trend_count = len(trend_report.trends) if trend_report else 0
    alert_strs  = [f"[{a.level}] {a.agent}: {a.message}" for a in alerts]
    voc_sent_str = f"{voc_report.sentiment_score:.2f}" if voc_report else "N/A"
    summary     = (
        f"Cycle #{cycle_num}: {trend_count} trends detected, "
        f"{len(competitor_report.profiles) if competitor_report else 0} competitors scanned, "
        f"VOC sentiment={voc_sent_str}, "
        f"{len(alerts)} alerts"
    )
    kb.log_cycle(summary, alert_strs)

    end      = datetime.now(timezone.utc)
    duration = (end - start).total_seconds()

    logger.info("[Orchestrator] Cycle #%d complete in %.1fs — %d alerts", cycle_num, duration, len(alerts))

    return IntelligenceCycle(
        cycle_number=cycle_num,
        timestamp=start.isoformat(),
        trend_report=trend_report,
        competitor_report=competitor_report,
        voc_report=voc_report,
        alerts=alerts,
        learning_summary=learning_summary,
        duration_seconds=duration,
    )
