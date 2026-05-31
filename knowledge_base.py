"""
tools/knowledge_base.py — Persistent SQLite-backed knowledge base.
Thread-safe, WAL mode, with typed methods for all data domains.
"""

import sqlite3
import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Optional

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

logger = logging.getLogger(__name__)

_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_conn() -> sqlite3.Connection:
    os.makedirs(config.KNOWLEDGE_STORE_DIR, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    with _lock:
        conn = _get_conn()
        cursor = conn.cursor()
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS trends (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword     TEXT NOT NULL,
                score       REAL NOT NULL,
                sources     TEXT,          -- JSON list of source URLs
                confidence  REAL,
                cycle_ts    TEXT NOT NULL,
                predicted   INTEGER DEFAULT 1  -- 1=predicted, 0=confirmed/debunked
            );

            CREATE TABLE IF NOT EXISTS competitors (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                data        TEXT NOT NULL,  -- JSON CompetitorProfile
                cycle_ts    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS voc_entries (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                pain_points TEXT,           -- JSON list
                desires     TEXT,           -- JSON list
                sentiment   REAL,
                cycle_ts    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS predictions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                agent       TEXT NOT NULL,
                prediction  TEXT NOT NULL,
                cycle_ts    TEXT NOT NULL,
                outcome     TEXT,           -- NULL until verified
                delta_score REAL            -- accuracy delta
            );

            CREATE TABLE IF NOT EXISTS learning_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          TEXT NOT NULL,
                source      TEXT NOT NULL,
                old_weight  REAL,
                new_weight  REAL,
                reason      TEXT
            );

            CREATE TABLE IF NOT EXISTS cycles (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          TEXT NOT NULL,
                summary     TEXT,
                alerts      TEXT            -- JSON list of alert strings
            );

            CREATE INDEX IF NOT EXISTS idx_trends_ts     ON trends(cycle_ts);
            CREATE INDEX IF NOT EXISTS idx_competitors_ts ON competitors(cycle_ts);
            CREATE INDEX IF NOT EXISTS idx_voc_ts        ON voc_entries(cycle_ts);
        """)
        conn.commit()
        conn.close()
    logger.info("Knowledge base initialised at %s", config.DB_PATH)


# ─── Trend Methods ────────────────────────────────────────────────────────────

def store_trends(trends: list[dict]):
    """Store a list of trend dicts from this cycle."""
    with _lock:
        conn = _get_conn()
        ts = _now()
        conn.executemany(
            "INSERT INTO trends (keyword, score, sources, confidence, cycle_ts) VALUES (?,?,?,?,?)",
            [(t["keyword"], t["score"], json.dumps(t.get("sources", [])),
              t.get("confidence", 0.5), ts) for t in trends]
        )
        conn.commit()
        conn.close()


def get_recent_trends(limit: int = 20) -> list[dict]:
    """Return the most recent trend records."""
    with _lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT keyword, score, sources, confidence, cycle_ts FROM trends "
            "ORDER BY cycle_ts DESC, score DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
    return [{"keyword": r[0], "score": r[1], "sources": json.loads(r[2] or "[]"),
             "confidence": r[3], "cycle_ts": r[4]} for r in rows]


# ─── Competitor Methods ───────────────────────────────────────────────────────

def store_competitor(name: str, profile: dict):
    """Store a competitor snapshot."""
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO competitors (name, data, cycle_ts) VALUES (?,?,?)",
            (name, json.dumps(profile), _now())
        )
        conn.commit()
        conn.close()


def get_competitor_history(name: str, limit: int = 5) -> list[dict]:
    """Return recent snapshots for a specific competitor."""
    with _lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT data, cycle_ts FROM competitors WHERE name=? ORDER BY cycle_ts DESC LIMIT ?",
            (name, limit)
        ).fetchall()
        conn.close()
    return [{"data": json.loads(r[0]), "cycle_ts": r[1]} for r in rows]


def get_all_latest_competitors() -> list[dict]:
    """Return the latest snapshot for each competitor."""
    with _lock:
        conn = _get_conn()
        rows = conn.execute("""
            SELECT name, data, cycle_ts FROM competitors
            WHERE cycle_ts = (SELECT MAX(cycle_ts) FROM competitors c2 WHERE c2.name = competitors.name)
            GROUP BY name
        """).fetchall()
        conn.close()
    return [{"name": r[0], "data": json.loads(r[1]), "cycle_ts": r[2]} for r in rows]


# ─── VOC Methods ──────────────────────────────────────────────────────────────

def store_voc(pain_points: list, desires: list, sentiment: float):
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO voc_entries (pain_points, desires, sentiment, cycle_ts) VALUES (?,?,?,?)",
            (json.dumps(pain_points), json.dumps(desires), sentiment, _now())
        )
        conn.commit()
        conn.close()


def get_recent_voc(limit: int = 3) -> list[dict]:
    with _lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT pain_points, desires, sentiment, cycle_ts FROM voc_entries "
            "ORDER BY cycle_ts DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
    return [{"pain_points": json.loads(r[0] or "[]"), "desires": json.loads(r[1] or "[]"),
             "sentiment": r[2], "cycle_ts": r[3]} for r in rows]


# ─── Prediction Methods ───────────────────────────────────────────────────────

def store_prediction(agent: str, prediction: str) -> int:
    """Store a prediction and return its row ID for later outcome update."""
    with _lock:
        conn = _get_conn()
        cursor = conn.execute(
            "INSERT INTO predictions (agent, prediction, cycle_ts) VALUES (?,?,?)",
            (agent, prediction, _now())
        )
        row_id = cursor.lastrowid
        conn.commit()
        conn.close()
    return row_id


def update_prediction_outcome(row_id: int, outcome: str, delta: float):
    with _lock:
        conn = _get_conn()
        conn.execute(
            "UPDATE predictions SET outcome=?, delta_score=? WHERE id=?",
            (outcome, delta, row_id)
        )
        conn.commit()
        conn.close()


def get_unverified_predictions(agent: str) -> list[dict]:
    with _lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT id, prediction, cycle_ts FROM predictions WHERE agent=? AND outcome IS NULL",
            (agent,)
        ).fetchall()
        conn.close()
    return [{"id": r[0], "prediction": r[1], "cycle_ts": r[2]} for r in rows]


# ─── Learning Log ─────────────────────────────────────────────────────────────

def log_weight_change(source: str, old: float, new: float, reason: str):
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO learning_log (ts, source, old_weight, new_weight, reason) VALUES (?,?,?,?,?)",
            (_now(), source, old, new, reason)
        )
        conn.commit()
        conn.close()


def get_learning_log(limit: int = 20) -> list[dict]:
    with _lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT ts, source, old_weight, new_weight, reason FROM learning_log "
            "ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
    return [{"ts": r[0], "source": r[1], "old_weight": r[2],
             "new_weight": r[3], "reason": r[4]} for r in rows]


# ─── Cycle Log ───────────────────────────────────────────────────────────────

def log_cycle(summary: str, alerts: list[str]):
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO cycles (ts, summary, alerts) VALUES (?,?,?)",
            (_now(), summary, json.dumps(alerts))
        )
        conn.commit()
        conn.close()


def get_cycle_count() -> int:
    with _lock:
        conn = _get_conn()
        count = conn.execute("SELECT COUNT(*) FROM cycles").fetchone()[0]
        conn.close()
    return count
