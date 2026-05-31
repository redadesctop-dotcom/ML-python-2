#!/usr/bin/env python
"""
Market Intelligence Agent CLI

Usage:
  python -m market_intel.run --cycle          # Run full intelligence cycle now
  python -m market_intel.run --query trends # Query knowledge base
  python -m market_intel.run --schedule     # Print cron schedule for proactive scans
"""

from __future__ import annotations

import argparse
import json
import sys
import structlog
from pathlib import Path

from . import kb as kb_mod
from .agent import run_intelligence_cycle

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger()

def cmd_cycle() -> int:
    logger.info("cycle_start", action="run_full_cycle")
    try:
        report = run_intelligence_cycle()
        print(report)
        logger.info("cycle_success")
        return 0
    except Exception as e:
        logger.error("cycle_failed", error=str(e))
        return 1


def cmd_query(what: str) -> int:
    logger.info("query_start", query_type=what)
    kb = kb_mod.load_kb()
    if what == "trends":
        for t in kb_mod.query_trends(kb):
            print(f"- [{t.get('status')}] {t.get('signal')} (conf: {t.get('confidence')})")
    elif what == "competitors":
        for k, v in kb_mod.query_competitors(kb).items():
            print(f"- {v.get('name', k)}: last_scan={v.get('last_scan')}")
    elif what == "sentiment":
        for s in kb_mod.query_recent_sentiment(kb):
            print(f"- {s.get('date')}: pains={s.get('pain_points')}")
    elif what == "alerts":
        for a in kb.get("alerts", [])[-20:]:
            print(f"- [{a.get('level')}] {a.get('trigger')}")
    elif what == "weights":
        print(json.dumps(kb.get("source_weights", {}), indent=2))
    else:
        logger.warning("query_unknown", query_type=what)
        print("Unknown query. Use: trends | competitors | sentiment | alerts | weights")
        return 1
    return 0


def cmd_schedule() -> int:
    print(
        """
Proactive scan schedule (cron examples — adjust paths):

# Daily — Competitor Analyzer (T1 prices/offers)
0 8 * * * cd /path/to/ML-paython && .venv/Scripts/python.exe -m market_intel.run --cycle

# Weekly — full cycle (Trend + VoC + learning) — Sunday 7am
0 7 * * 0 cd /path/to/ML-paython && .venv/Scripts/python.exe -m market_intel.run --cycle

# Monthly — self-learning calibration (first of month)
0 6 1 * * cd /path/to/ML-paython && .venv/Scripts/python.exe -m market_intel.run --learn-only
"""
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Market Intelligence Agent")
    parser.add_argument("--cycle", action="store_true", help="Run intelligence cycle now")
    parser.add_argument("--query", type=str, metavar="WHAT", help="Query KB: trends|competitors|sentiment|alerts|weights")
    parser.add_argument("--schedule", action="store_true", help="Show proactive scan schedule")

    args = parser.parse_args()

    if args.cycle:
        return cmd_cycle()
    elif args.query:
        return cmd_query(args.query)
    elif args.schedule:
        return cmd_schedule()
    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
