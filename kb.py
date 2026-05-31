"""Dynamic Storage — persistent queryable knowledge base for market intelligence."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

KB_PATH = Path(__file__).resolve().parent / "kb.json"


def _today() -> str:
    return date.today().isoformat()


def load_kb(path: Path = KB_PATH) -> Dict[str, Any]:
    if not path.exists():
        return _default_kb()
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_kb(kb: Dict[str, Any], path: Path = KB_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(kb, f, indent=2, ensure_ascii=False)


def _default_kb() -> Dict[str, Any]:
    return {
        "meta": {
            "agent": "Market Intelligence Agent",
            "version": "1.0",
            "last_cycle_id": None,
            "niche": None,
            "geography": None,
            "competitors": [],
            "trend_keywords": [],
            "scan_schedule": {
                "t1_competitor_prices": "daily",
                "trend_spotter": "weekly",
                "voc_reviews": "weekly",
                "self_learning_calibration": "monthly",
            },
        },
        "source_weights": {
            "trend_news": 1.0,
            "competitor_pricing": 1.0,
            "voc_reviews": 1.0,
            "social_forums": 0.8,
        },
        "trend_timeline": [],
        "competitor_profiles": {},
        "sentiment_history": [],
        "predictions": [],
        "alerts": [],
        "cycles": [],
    }


def merge_config_into_kb(kb: Dict[str, Any], config: Dict[str, Any]) -> None:
    kb["meta"]["niche"] = config.get("niche")
    kb["meta"]["geography"] = config.get("geography")
    kb["meta"]["competitors"] = config.get("competitors", [])
    kb["meta"]["trend_keywords"] = config.get("trend_keywords", [])


def add_cycle(kb: Dict[str, Any], cycle_id: str, summary: str, mode: str) -> None:
    kb["meta"]["last_cycle_id"] = cycle_id
    kb["cycles"].append(
        {
            "id": cycle_id,
            "date": _today(),
            "mode": mode,
            "summary": summary,
        }
    )
    # Keep last 50 cycles
    kb["cycles"] = kb["cycles"][-50:]


def upsert_trend(
    kb: Dict[str, Any],
    signal: str,
    status: str,
    confidence: str,
    keywords: List[str],
    sources: List[str],
) -> str:
    tid = signal.lower().replace(" ", "_")[:48]
    for t in kb["trend_timeline"]:
        if t.get("signal") == signal:
            t["status"] = status
            t["confidence"] = confidence
            t["last_updated"] = _today()
            t["keywords"] = list(set(t.get("keywords", []) + keywords))[:20]
            t["sources"] = list(dict.fromkeys(t.get("sources", []) + sources))[:15]
            return t["id"]
    entry = {
        "id": f"trend_{tid}_{_today().replace('-', '')}",
        "signal": signal,
        "status": status,
        "first_seen": _today(),
        "last_updated": _today(),
        "confidence": confidence,
        "keywords": keywords[:20],
        "sources": sources[:15],
    }
    kb["trend_timeline"].append(entry)
    return entry["id"]


def update_competitor_profile(
    kb: Dict[str, Any],
    name: str,
    url: Optional[str],
    findings: List[Dict[str, Any]],
) -> None:
    key = name.lower().replace(" ", "_")
    prof = kb["competitor_profiles"].get(key, {"name": name, "url": url, "history": []})
    prof["url"] = url or prof.get("url")
    prof["last_scan"] = _today()
    prof["latest_findings"] = findings
    prof["history"].append({"date": _today(), "findings": findings})
    prof["history"] = prof["history"][-30:]
    kb["competitor_profiles"][key] = prof


def add_sentiment_snapshot(kb: Dict[str, Any], pains: List[str], desires: List[str], sources: List[str]) -> None:
    kb["sentiment_history"].append(
        {
            "date": _today(),
            "pain_points": pains[:15],
            "desires": desires[:15],
            "sources": sources[:15],
        }
    )
    kb["sentiment_history"] = kb["sentiment_history"][-60:]


def add_alert(kb: Dict[str, Any], level: str, trigger: str, action: str) -> None:
    for a in kb["alerts"]:
        if a.get("trigger") == trigger and a.get("level") == level:
            a["detected"] = _today()
            a["action"] = action
            return
    kb["alerts"].append(
        {
            "level": level,
            "trigger": trigger,
            "detected": _today(),
            "action": action,
            "active": True,
        }
    )
    kb["alerts"] = kb["alerts"][-100:]


def add_prediction(kb: Dict[str, Any], prediction: str, verify_by: str) -> str:
    pid = f"pred_{len(kb['predictions']) + 1:03d}_{_today().replace('-', '')}"
    kb["predictions"].append(
        {
            "id": pid,
            "made": _today(),
            "prediction": prediction,
            "verify_by": verify_by,
            "outcome": None,
            "delta_notes": None,
        }
    )
    return pid


def adjust_source_weights(kb: Dict[str, Any], deltas: Dict[str, float]) -> None:
    w = kb["source_weights"]
    for k, d in deltas.items():
        if k in w:
            w[k] = round(max(0.5, min(2.0, w[k] + d)), 3)
    kb["source_weights"] = w


def query_trends(kb: Dict[str, Any], status: Optional[str] = None) -> List[Dict[str, Any]]:
    trends = kb.get("trend_timeline", [])
    if status:
        return [t for t in trends if t.get("status") == status]
    return trends


def query_competitors(kb: Dict[str, Any]) -> Dict[str, Any]:
    return kb.get("competitor_profiles", {})


def query_recent_sentiment(kb: Dict[str, Any], n: int = 3) -> List[Dict[str, Any]]:
    return kb.get("sentiment_history", [])[-n:]
