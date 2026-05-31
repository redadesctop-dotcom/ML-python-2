"""
config.py — Central configuration for Market Intelligence Agent
Domain: Electronics & Gadgets
"""

# ─── Market Domain ────────────────────────────────────────────────────────────
MARKET_DOMAIN = "Electronics & Gadgets"

# ─── Search Engine ────────────────────────────────────────────────────────────
# Set SERP_API_KEY to a real key to use SerpAPI; leave None to use DuckDuckGo
SERP_API_KEY = None
SEARCH_MAX_RESULTS = 8          # Results per query
SEARCH_RATE_LIMIT_DELAY = (1.5, 3.5)  # (min_sec, max_sec) jitter between requests

# ─── Trend Spotter Keywords ───────────────────────────────────────────────────
TREND_KEYWORDS = [
    "best new gadgets 2025",
    "electronics market trends",
    "consumer electronics rising demand",
    "upcoming smartphone releases",
    "wearable tech trends",
    "AI chip consumer devices",
    "smart home devices trending",
    "wireless audio market growth",
    "gaming hardware 2025",
    "electric vehicle accessories trending",
]

# ─── Competitor Monitoring ────────────────────────────────────────────────────
COMPETITORS = [
    {"name": "Apple",   "search_terms": ["Apple product news", "Apple pricing 2025", "Apple reviews"]},
    {"name": "Samsung", "search_terms": ["Samsung deals", "Samsung new release", "Samsung consumer reviews"]},
    {"name": "Anker",   "search_terms": ["Anker accessories price", "Anker new product", "Anker reviews"]},
    {"name": "Sony",    "search_terms": ["Sony electronics deals", "Sony product launch", "Sony customer feedback"]},
    {"name": "Bose",    "search_terms": ["Bose pricing", "Bose new headphones", "Bose reviews 2025"]},
]

# ─── Voice of Customer Sources ────────────────────────────────────────────────
VOC_SEARCH_QUERIES = [
    "electronics complaints Reddit 2025",
    "best gadgets user reviews 2025",
    "smartphone problems customers",
    "what do customers want in gadgets",
    "electronics negative reviews forum",
    "consumer electronics wishlist features",
]

# ─── Alert Thresholds ─────────────────────────────────────────────────────────
ALERT_THRESHOLDS = {
    "sentiment_drop_pct": 20,      # % drop in positive sentiment triggers WARNING
    "sentiment_critical_pct": 40,  # % drop triggers CRITICAL
    "trend_velocity_min": 3,       # Trend must appear in ≥3 sources to be reportable
    "competitor_price_change_pct": 10,  # % price mention change triggers alert
}

# ─── Scheduler ────────────────────────────────────────────────────────────────
SCHEDULE_INTERVAL_HOURS = 6       # Full intelligence cycle every N hours
RUN_ON_STARTUP = True             # Run immediately when 'watch' mode starts

# ─── Knowledge Store ─────────────────────────────────────────────────────────
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KNOWLEDGE_STORE_DIR = os.path.join(BASE_DIR, "knowledge_store")
DB_PATH = os.path.join(KNOWLEDGE_STORE_DIR, "intelligence.db")
REPORTS_DIR = os.path.join(KNOWLEDGE_STORE_DIR, "reports")
WEIGHTS_FILE = os.path.join(KNOWLEDGE_STORE_DIR, "learning_weights.json")

# ─── Initial Source Weights ───────────────────────────────────────────────────
DEFAULT_SOURCE_WEIGHTS = {
    "duckduckgo_news": 1.0,
    "duckduckgo_web":  1.0,
    "reddit_search":   1.0,
    "review_sites":    1.0,
    "competitor_search": 1.0,
}

# ─── NLP Stopwords ────────────────────────────────────────────────────────────
STOPWORDS = {
    "the", "a", "an", "is", "it", "in", "on", "at", "to", "for", "of",
    "and", "or", "but", "with", "this", "that", "are", "was", "were",
    "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might", "can", "not",
    "from", "by", "as", "up", "out", "if", "its", "your", "my", "our",
    "their", "we", "they", "he", "she", "i", "you", "so", "no", "get",
    "just", "more", "also", "about", "than", "then", "when", "how",
    "what", "which", "who", "all", "any", "new", "one", "two", "said",
}

# ─── Sentiment Keywords ───────────────────────────────────────────────────────
POSITIVE_WORDS = {
    "great", "excellent", "amazing", "love", "best", "good", "fantastic",
    "perfect", "awesome", "superb", "outstanding", "recommended", "happy",
    "satisfied", "reliable", "durable", "innovative", "fast", "smooth",
    "quality", "value", "impressed", "brilliant", "solid", "worth",
}

NEGATIVE_WORDS = {
    "bad", "terrible", "awful", "worst", "broken", "poor", "disappointed",
    "useless", "defective", "unreliable", "slow", "expensive", "overpriced",
    "frustrating", "annoying", "fake", "cheap", "flimsy", "problem",
    "issue", "fail", "failed", "failure", "return", "refund", "regret",
    "waste", "fragile", "disappointing", "avoid", "scam", "overheating",
}
