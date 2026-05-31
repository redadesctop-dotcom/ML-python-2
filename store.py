import sqlite3
import faiss
import numpy as np
import logging
from pathlib import Path

logger = logging.getLogger("memory.store")

class AIEditorMemory:
    def __init__(self, db_path: str = "memory/store.db", index_path: str = "memory/vector.index"):
        self.db_path = db_path
        self.index_path = index_path
        self.init_db()
        self.init_vector_store()

    def init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                tool TEXT,
                args TEXT,
                status TEXT,
                message TEXT
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS policy_adaptation (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                policy_key TEXT,
                old_value TEXT,
                new_value TEXT,
                confidence REAL
            )
        ''')
        conn.commit()
        conn.close()

    def init_vector_store(self):
        dimension = 1536 # Default for OpenAI embeddings
        if Path(self.index_path).exists():
            self.index = faiss.read_index(self.index_path)
        else:
            self.index = faiss.IndexFlatL2(dimension)

    def log_audit(self, tool: str, args: str, status: str, message: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO audit_log (tool, args, status, message) VALUES (?, ?, ?, ?)',
                       (tool, args, status, message))
        conn.commit()
        conn.close()

    def update_policy(self, key: str, old: str, new: str, conf: float):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO policy_adaptation (policy_key, old_value, new_value, confidence) VALUES (?, ?, ?, ?)',
                       (key, old, new, conf))
        conn.commit()
        conn.close()
        logger.info(f"Policy updated: {key} -> {new} (conf: {conf})")
