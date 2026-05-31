"""
scheduler.py — APScheduler-based background job runner.
Manages periodic intelligence cycles and exposes next-run time.
"""

import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Callable, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config

logger = logging.getLogger(__name__)

_scheduler: Optional[BackgroundScheduler] = None
_next_run:  Optional[datetime]            = None
_lock = threading.Lock()


def _update_next_run():
    global _next_run
    if _scheduler:
        jobs = _scheduler.get_jobs()
        if jobs:
            _next_run = jobs[0].next_run_time


def get_next_run() -> Optional[datetime]:
    return _next_run


def start(cycle_fn: Callable, run_now: bool = True):
    """
    Start the background scheduler.

    Args:
        cycle_fn:  The function to call on each scheduled cycle.
        run_now:   If True, run one cycle immediately before scheduling.
    """
    global _scheduler

    if run_now:
        logger.info("[Scheduler] Running immediate startup cycle...")
        try:
            cycle_fn()
        except Exception as e:
            logger.error("[Scheduler] Startup cycle failed: %s", e, exc_info=True)

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        func=cycle_fn,
        trigger=IntervalTrigger(hours=config.SCHEDULE_INTERVAL_HOURS),
        id="intelligence_cycle",
        name="Market Intelligence Cycle",
        replace_existing=True,
        misfire_grace_time=300,
    )
    _scheduler.start()
    _update_next_run()

    logger.info(
        "[Scheduler] Background scheduler started — interval: %dh | next: %s",
        config.SCHEDULE_INTERVAL_HOURS,
        _next_run.isoformat() if _next_run else "unknown",
    )


def stop():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Stopped.")
