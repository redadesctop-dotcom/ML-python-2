import time
import json
import sqlite3
from typing import List, Dict, Any, Optional
import numpy as np

class EpisodicMemory:
    """eAI Experience Memory: Records and retrieves significant decisions with context."""
    
    def __init__(self, db_path: str = "memory/episodic.db"):
        self.db_path = db_path
        self._init_db()
        self.decay_rate = 0.01 # Memory decay over time

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS episodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL,
                agent_id TEXT,
                context_summary TEXT,
                decision TEXT,
                outcome_reward REAL,
                importance REAL DEFAULT 1.0,
                full_data TEXT
            )
        ''')
        conn.commit()
        conn.close()

    def record_episode(self, agent_id: str, context: Dict[str, Any], decision: str, outcome_reward: float):
        """Record a significant decision with its context and outcome."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Calculate initial importance based on reward absolute value
        importance = 1.0 + abs(outcome_reward)
        
        cursor.execute('''
            INSERT INTO episodes (timestamp, agent_id, context_summary, decision, outcome_reward, importance, full_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            time.time(),
            agent_id,
            context.get("summary", ""),
            decision,
            outcome_reward,
            importance,
            json.dumps({"context": context, "decision": decision, "reward": outcome_reward})
        ))
        conn.commit()
        conn.close()

    def retrieve_relevant_episodes(self, current_context: str, limit: int = 3) -> List[Dict[str, Any]]:
        """Retrieve past episodes similar to current context, considering importance and decay."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # In a real system, we'd use vector embeddings for 'context_summary'
        # For this implementation, we'll use keyword overlap and importance/decay
        cursor.execute('SELECT * FROM episodes')
        rows = cursor.fetchall()
        
        current_time = time.time()
        scored_episodes = []
        
        for row in rows:
            # Simple keyword similarity (can be upgraded to embeddings)
            overlap = self._calculate_similarity(current_context, row['context_summary'])
            
            # Apply time decay to importance
            time_diff = (current_time - row['timestamp']) / 3600 # hours
            decayed_importance = row['importance'] * np.exp(-self.decay_rate * time_diff)
            
            score = overlap * decayed_importance
            if score > 0.1: # Threshold for relevance
                scored_episodes.append({
                    "id": row['id'],
                    "decision": row['decision'],
                    "reward": row['outcome_reward'],
                    "score": score,
                    "data": json.loads(row['full_data'])
                })
        
        conn.close()
        
        # Sort by score and return top results
        scored_episodes.sort(key=lambda x: x['score'], reverse=True)
        return scored_episodes[:limit]

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Simple keyword-based similarity metric."""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        if not words1 or not words2:
            return 0.0
        intersection = words1.intersection(words2)
        return len(intersection) / min(len(words1), len(words2))

    def update_importance(self, episode_id: int, feedback_delta: float):
        """Update importance of a memory based on later feedback."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('UPDATE episodes SET importance = importance + ? WHERE id = ?', (feedback_delta, episode_id))
        conn.commit()
        conn.close()

    def cleanup_old_memories(self, threshold: float = 0.05):
        """Remove memories that have decayed below a certain importance threshold."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        # This is a bit complex with SQL alone if we want true decay, 
        # but we can just delete very old ones with low importance
        current_time = time.time()
        # simplified: delete memories older than 30 days with low importance
        thirty_days_ago = current_time - (30 * 24 * 3600)
        cursor.execute('DELETE FROM episodes WHERE timestamp < ? AND importance < 1.1', (thirty_days_ago,))
        conn.commit()
        conn.close()
