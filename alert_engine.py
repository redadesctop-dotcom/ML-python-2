"""
alert_engine.py — Significant market shift detection and alert dispatch.
Evaluates trend velocity, competitor sentiment drops, and VOC swings.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config

logger = logging.getLogger(__name__)


@dataclass
class Alert:
    level: str          # INFO | WARNING | CRITICAL
    agent: str
    message: str
    timestamp: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def evaluate(trend_report, competitor_report, voc_report) -> list[Alert]:
    """
    Evaluate all agent outputs and return a prioritised list of Alert objects.
    """
    alerts: list[Alert] = []

    # ── 1. Trend Velocity Alerts ──────────────────────────────────────────────
    if trend_report and trend_report.trends:
        top = trend_report.trends[0]
        if top.confidence >= 0.80:
            alerts.append(Alert(
                level="WARNING",
                agent="TrendSpotter",
                message=(f"High-confidence trend detected: '{top.keyword}' "
                         f"(score={top.score:.2f}, conf={top.confidence:.0%})"),
                timestamp=_now(),
            ))
        elif top.confidence >= 0.60:
            alerts.append(Alert(
                level="INFO",
                agent="TrendSpotter",
                message=f"Rising trend: '{top.keyword}' (conf={top.confidence:.0%})",
                timestamp=_now(),
            ))

    # ── 2. Competitor Alerts ──────────────────────────────────────────────────
    if competitor_report:
        for raw in competitor_report.alerts:
            level = "INFO"
            if raw.startswith("[WARNING]"):
                level = "WARNING"
                raw = raw[len("[WARNING]"):].strip()
            elif raw.startswith("[CRITICAL]"):
                level = "CRITICAL"
                raw = raw[len("[CRITICAL]"):].strip()
            elif raw.startswith("[INFO]"):
                raw = raw[len("[INFO]"):].strip()

            alerts.append(Alert(
                level=level,
                agent="CompetitorAnalyzer",
                message=raw,
                timestamp=_now(),
            ))

    # ── 3. VOC Sentiment Alerts ────────────────────────────────────────────────
    if voc_report:
        score = voc_report.sentiment_score
        delta = voc_report.sentiment_delta

        if score < 0.35:
            alerts.append(Alert(
                level="CRITICAL",
                agent="VOCAnalyzer",
                message=(f"Customer sentiment critically low: {score:.0%} positive. "
                         f"Top pain: {voc_report.pain_points[0][:70] if voc_report.pain_points else 'N/A'}"),
                timestamp=_now(),
            ))
        elif score < 0.45:
            alerts.append(Alert(
                level="WARNING",
                agent="VOCAnalyzer",
                message=f"Customer sentiment below threshold: {score:.0%} positive.",
                timestamp=_now(),
            ))

        if delta is not None and delta < -(config.ALERT_THRESHOLDS["sentiment_drop_pct"] / 100):
            alerts.append(Alert(
                level="WARNING",
                agent="VOCAnalyzer",
                message=f"Sentiment dropped {abs(delta):.0%} since last cycle.",
                timestamp=_now(),
            ))

    # ── 4. Priority Sort: CRITICAL → WARNING → INFO ───────────────────────────
    priority = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
    alerts.sort(key=lambda a: priority.get(a.level, 3))

    logger.info("[AlertEngine] %d alerts generated (%d critical, %d warning, %d info)",
                len(alerts),
                sum(1 for a in alerts if a.level == "CRITICAL"),
                sum(1 for a in alerts if a.level == "WARNING"),
                sum(1 for a in alerts if a.level == "INFO"))

    return alerts
