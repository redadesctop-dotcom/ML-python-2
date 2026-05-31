"""Format concise, prioritised market intelligence reports."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List


def build_report(
    cycle_id: str,
    niche: str,
    geography: str,
    trend_result,
    competitor_result,
    voc_result,
    learning_summary: Dict[str, Any],
    kb: Dict[str, Any],
) -> str:
    alerts = _collect_alerts(trend_result, competitor_result, voc_result)
    p0 = [a for a in alerts if a.get("level") == "P0"]
    p1 = [a for a in alerts if a.get("level") == "P1"]
    p2 = [a for a in alerts if a.get("level") not in ("P0", "P1")]

    lines = [
        "# Market Intelligence Report",
        f"**Cycle:** `{cycle_id}`  ",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}  ",
        f"**Niche:** {niche} | **Geography:** {geography}  ",
        "",
        "## Executive summary",
        _executive_summary(trend_result, competitor_result, voc_result, alerts),
        "",
    ]

    if p0:
        lines += ["## P0 — Immediate alerts", ""]
        for a in p0:
            lines.append(f"- **{a['trigger']}** → {a['action']}")
        lines.append("")

    lines += ["## P1 — Act this week", ""]
    for item in _p1_actions(trend_result, competitor_result, voc_result)[:6]:
        lines.append(f"- {item}")
    if p1:
        lines.append("")
        lines.append("### Active alerts")
        for a in p1:
            lines.append(f"- [{a['level']}] {a['trigger']} → {a['action']}")
    lines.append("")

    lines += ["## Trend Spotter", ""]
    for ins in (trend_result.insights or [])[:6]:
        lines.append(f"- {ins}")
    if not trend_result.insights:
        lines.append("- No new trend signals above threshold (refine keywords in config.json).")
    lines.append("")

    lines += ["## Competitor Analyzer", ""]
    if competitor_result.signals:
        for sig in competitor_result.signals[:5]:
            name = sig.get("competitor", "market")
            lines.append(f"- **{name}:** {len(sig.get('findings', []))} new intelligence hits")
            for f in sig.get("findings", [])[:2]:
                lines.append(f"  - {f.get('title', '')[:90]}")
    else:
        for ins in (competitor_result.insights or [])[:5]:
            lines.append(f"- {ins}")
        if not competitor_result.insights:
            lines.append("- Add competitor URLs/names in `market_intel/config.json` for named tracking.")
    lines.append("")

    lines += ["## Voice of Customer", ""]
    voc_sig = voc_result.signals[0] if voc_result.signals else {}
    for p in voc_sig.get("pain_points", [])[:5]:
        lines.append(f"- **Pain:** {p}")
    for d in voc_sig.get("desires", [])[:5]:
        lines.append(f"- **Desire:** {d}")
    if not voc_sig.get("pain_points") and not voc_sig.get("desires"):
        lines.append("- Run with niche-specific VoC templates for sharper pain clusters.")
    lines.append("")

    lines += ["## Self-learning loop", ""]
    lines.append(f"- Predictions verified this cycle: **{learning_summary.get('predictions_verified', 0)}**")
    wd = learning_summary.get("weight_deltas") or {}
    if wd:
        lines.append(f"- Source weight adjustments: `{wd}`")
    lines.append(f"- Current weights: `{kb.get('source_weights', {})}`")
    for n in learning_summary.get("notes", [])[:5]:
        lines.append(f"- {n}")
    lines.append("")

    lines += ["## Scan schedule (proactive)", ""]
    sched = kb.get("meta", {}).get("scan_schedule", {})
    for k, v in sched.items():
        lines.append(f"- **{k}:** {v}")
    lines.append("")
    lines.append("---")
    lines.append("*Next run:* `python -m market_intel.run --cycle`")
    lines.append("*Configure niche/competitors:* `market_intel/config.json`")

    return "\n".join(lines)


def _collect_alerts(trend, comp, voc) -> List[Dict[str, str]]:
    out = []
    for r in (trend, comp, voc):
        out.extend(getattr(r, "alerts", []) or [])
    return out


def _executive_summary(trend, comp, voc, alerts) -> str:
    parts = []
    if trend.insights:
        parts.append(f"Trends: {trend.insights[0][:100]}")
    if comp.alerts or comp.insights:
        parts.append("Competitive pricing/offer activity detected.")
    voc_sig = voc.signals[0] if voc.signals else {}
    if voc_sig.get("pain_points"):
        parts.append(f"Top customer pain: {voc_sig['pain_points'][0]}.")
    if not parts:
        parts.append("Baseline scan complete; configure niche and competitors for targeted intelligence.")
    alert_note = f" **{len(alerts)} alert(s)** flagged." if alerts else ""
    return (parts[0] if len(parts) == 1 else " | ".join(parts[:3])) + alert_note


def _p1_actions(trend, comp, voc) -> List[str]:
    actions = []
    if trend.insights:
        actions.append(
            f"Optimize for AI/product discovery: {trend.insights[0][:80]}…"
        )
    voc_sig = voc.signals[0] if voc.signals else {}
    for p in voc_sig.get("pain_points", [])[:2]:
        actions.append(f"Address VoC pain on PDP/support: {p}")
    for ins in (comp.insights or [])[:2]:
        actions.append(f"Competitive response: {ins}")
    if not actions:
        actions.append(
            "Set `niche`, `geography`, and `competitors` in config.json, then re-run cycle."
        )
    return actions
