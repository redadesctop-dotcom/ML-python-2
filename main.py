"""
main.py — CLI entry point for Market Intelligence Agent
Commands:
  run    — single intelligence cycle + print report
  watch  — continuous scheduler + live dashboard
  report — print last saved report
  reset-learning — reset source weights to defaults
"""

import argparse
import glob
import json
import logging
import os
import signal
import sys
import threading

# Force UTF-8 encoding on Windows to prevent UnicodeEncodeError in standard streams
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


# ── Bootstrap path ────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

import config
from tools import knowledge_base as kb
from tools import self_learning
import orchestrator
import scheduler as sched
from reports import report_generator
from dashboard import terminal_ui

# ── Logging setup ─────────────────────────────────────────────────────────────
os.makedirs(config.KNOWLEDGE_STORE_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(config.KNOWLEDGE_STORE_DIR, "agent.log"), encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("main")

# ── Shared state ──────────────────────────────────────────────────────────────
_latest_cycle   = None
_cycle_lock     = threading.Lock()


def _store_cycle(cycle):
    global _latest_cycle
    with _cycle_lock:
        _latest_cycle = cycle


def _get_cycle():
    with _cycle_lock:
        return _latest_cycle


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_run(_args):
    """Run a single intelligence cycle and print the report."""
    kb.init_db()
    from rich.console import Console
    console = Console()
    console.print("\n[bold cyan]📡 Market Intelligence Agent — Single Cycle Run[/bold cyan]\n")
    console.print(f"[dim]Domain: {config.MARKET_DOMAIN}[/dim]")
    console.print(f"[dim]Search engine: {'SerpAPI' if config.SERP_API_KEY else 'DuckDuckGo (free)'}[/dim]\n")

    with console.status("[bold green]Running intelligence cycle — this may take 60–120s...[/bold green]"):
        cycle = orchestrator.run_cycle()

    _store_cycle(cycle)
    report_text, report_path = report_generator.generate(cycle)

    console.print("\n")
    terminal_ui.print_report(report_text)
    console.print(f"\n[dim]📄 Report saved → {report_path}[/dim]\n")

    # Alert summary
    if cycle.alerts:
        console.print(f"[bold red]🚨 {len(cycle.alerts)} alert(s) generated.[/bold red]")
        for a in cycle.alerts:
            icon = {"CRITICAL": "🔴", "WARNING": "🟡", "INFO": "🔵"}.get(a.level, "•")
            console.print(f"  {icon} [{a.level}] {a.agent}: {a.message}")
    else:
        console.print("[bold green]✅ No significant alerts this cycle.[/bold green]")

    console.print(f"\n[dim]⏱ Cycle completed in {cycle.duration_seconds:.1f}s[/dim]")


def cmd_watch(_args):
    """Continuous watch mode: scheduler + live dashboard."""
    kb.init_db()

    def cycle_fn():
        cycle = orchestrator.run_cycle()
        _store_cycle(cycle)
        report_generator.generate(cycle)

    # Graceful shutdown on Ctrl+C / SIGTERM
    stop_event = threading.Event()

    def _shutdown(sig, frame):
        stop_event.set()
        sched.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # Start scheduler (runs immediate cycle first)
    sched_thread = threading.Thread(
        target=sched.start,
        kwargs={"cycle_fn": cycle_fn, "run_now": config.RUN_ON_STARTUP},
        daemon=True,
    )
    sched_thread.start()

    # Give the first cycle a moment to initialise before launching dashboard
    import time
    time.sleep(3)

    from rich.console import Console
    Console().print("[bold cyan]📡 Launching live dashboard... (Ctrl+C to exit)[/bold cyan]")

    terminal_ui.run_live(
        get_cycle_fn=_get_cycle,
        next_scan_dt=sched.get_next_run(),
    )


def cmd_report(_args):
    """Print the most recently saved report."""
    report_dir = config.REPORTS_DIR
    if not os.path.isdir(report_dir):
        print("No reports found. Run `python main.py run` first.")
        return

    files = sorted(glob.glob(os.path.join(report_dir, "report_*.md")), reverse=True)
    if not files:
        print("No reports found. Run `python main.py run` first.")
        return

    latest = files[0]
    with open(latest, encoding="utf-8") as f:
        text = f.read()

    terminal_ui.print_report(text)
    print(f"\n📄 Source: {latest}")


def cmd_reset_learning(_args):
    """Reset all source and keyword weights back to defaults."""
    self_learning.save_weights(dict(config.DEFAULT_SOURCE_WEIGHTS))
    kw_defaults = {kw: 1.0 for kw in config.TREND_KEYWORDS}
    self_learning.save_keyword_weights(kw_defaults)
    print("✅ Learning weights reset to defaults.")
    print(json.dumps(config.DEFAULT_SOURCE_WEIGHTS, indent=2))


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="market-intelligence",
        description="📡 Market Intelligence Agent — Electronics & Gadgets",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run",            help="Run one intelligence cycle and print the report")
    sub.add_parser("watch",          help="Continuous mode: scheduler + live dashboard")
    sub.add_parser("report",         help="Print the last saved report")
    sub.add_parser("reset-learning", help="Reset self-learning weights to defaults")

    args = parser.parse_args()

    dispatch = {
        "run":            cmd_run,
        "watch":          cmd_watch,
        "report":         cmd_report,
        "reset-learning": cmd_reset_learning,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
