"""Self-Learning Loop — calibrate predictions and source weights from outcomes."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Tuple

from .search_arm import web_search


def _parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def run_self_learning(
    kb: Dict[str, Any],
    cycle_signals: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compare past predictions to new evidence; adjust source_weights and keywords.
    Returns a summary dict for the report.
    """
    today = date.today()
    verified = 0
    weight_deltas: Dict[str, float] = {}
    notes: List[str] = []

    predictions = kb.get("predictions", [])
    for pred in predictions:
        if pred.get("outcome") is not None:
            continue
        verify_by = pred.get("verify_by")
        if not verify_by:
            continue
        try:
            due = _parse_date(verify_by)
        except ValueError:
            continue
        if today < due:
            continue

        # Verify via lightweight search on prediction text
        q = pred.get("prediction", "")[:120]
        hits = web_search(f"{q} news 2026", max_results=3)
        confirmed = _prediction_confirmed(pred.get("prediction", ""), hits)
        pred["outcome"] = "confirmed" if confirmed else "not_confirmed"
        pred["delta_notes"] = (
            f"Auto-checked {today.isoformat()}: "
            + ("supporting snippets found" if confirmed else "no strong confirmation")
        )
        verified += 1
        if confirmed:
            notes.append(f"Confirmed: {pred['id']}")
        else:
            notes.append(f"Not confirmed: {pred['id']} — reduce reliance on similar prior signals")

    # Adjust weights from this cycle's sub-agent yield
    trend_n = len(cycle_signals.get("trend_signals", []))
    comp_n = len(cycle_signals.get("competitor_signals", []))
    voc_n = len(cycle_signals.get("voc_pains", [])) + len(cycle_signals.get("voc_desires", []))
    alerts_n = len(cycle_signals.get("alerts", []))

    if trend_n >= 3:
        weight_deltas["trend_news"] = 0.05
    elif trend_n == 0:
        weight_deltas["trend_news"] = -0.05

    if comp_n >= 1 or alerts_n > 0:
        weight_deltas["competitor_pricing"] = 0.05
    if voc_n >= 2:
        weight_deltas["voc_reviews"] = 0.05
        weight_deltas["social_forums"] = 0.03

    if weight_deltas:
        from .kb import adjust_source_weights

        adjust_source_weights(kb, weight_deltas)

    # Refine Trend Spotter keywords from high-confidence signals
    new_kws: List[str] = []
    for sig in cycle_signals.get("trend_signals", []):
        if sig.get("confidence") == "high":
            new_kws.extend(sig.get("keywords", [])[:3])
    if new_kws:
        existing = kb["meta"].setdefault("trend_keywords", [])
        merged = list(dict.fromkeys(existing + new_kws))[:25]
        kb["meta"]["trend_keywords"] = merged
        notes.append(f"Trend keywords updated (+{len(new_kws)} candidates)")

    return {
        "predictions_verified": verified,
        "weight_deltas": weight_deltas,
        "notes": notes,
    }


def _prediction_confirmed(prediction: str, hits) -> bool:
    pl = prediction.lower()
    for h in hits:
        blob = (h.title + " " + h.snippet).lower()
        # Simple overlap: any significant word from prediction appears with growth/regulation context
        words = [w for w in pl.split() if len(w) > 5][:8]
        if sum(1 for w in words if w in blob) >= 2:
            return True
    return False


def register_cycle_predictions(kb: Dict[str, Any], cycle_signals: Dict[str, Any]) -> None:
    """Add forward-looking predictions after each cycle."""
    from .kb import add_prediction
    from datetime import timedelta

    if cycle_signals.get("trend_signals"):
        add_prediction(
            kb,
            "AI-assisted discovery and agentic shopping continue gaining share in e-commerce",
            (date.today() + timedelta(days=30)).isoformat(),
        )
    if any("regulation" in str(s.get("signal", "")).lower() for s in cycle_signals.get("trend_signals", [])):
        add_prediction(
            kb,
            "More jurisdictions will restrict surveillance or opaque dynamic pricing",
            (date.today() + timedelta(days=60)).isoformat(),
        )
