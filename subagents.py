"""Three coordinated sub-agents: Trend Spotter, Competitor Analyzer, Voice of Customer."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .search_arm import SearchHit, web_search


@dataclass
class SubAgentResult:
    agent: str
    queries: List[str]
    hits: List[SearchHit] = field(default_factory=list)
    insights: List[str] = field(default_factory=list)
    signals: List[Dict[str, Any]] = field(default_factory=list)
    alerts: List[Dict[str, str]] = field(default_factory=list)
    # eAI metadata
    intent: str = ""
    uncertainty: float = 0.0
    reasoning_path: str = ""
    confidence_report: str = ""
    uncertainty_details: Dict[str, Any] = field(default_factory=dict)


def _template(s: str, niche: str) -> str:
    return s.replace("{niche}", niche)


# --- Heuristic extractors (no LLM required; works offline on search snippets) ---

TREND_RISING = re.compile(
    r"\b(grow|growing|surge|rise|rising|boom|record|accelerat|dominat|shift|disrupt)\w*\b",
    re.I,
)
TREND_DECLINE = re.compile(r"\b(decline|fall|slow|saturat|plateau)\w*\b", re.I)
PRICE_WAR = re.compile(
    r"\b(price cut|discount|undercut|lowest price|price war|markdown|promotion)\w*\b",
    re.I,
)
REGULATION = re.compile(
    r"\b(regulat|ban|law|ftc|surveillance pricing|dynamic pricing)\w*\b",
    re.I,
)
AI_COMMERCE = re.compile(
    r"\b(ai|agentic|chatgpt|personaliz|generative|assistant|llm)\b.*\b(shop|commerce|retail|buy)\w*\b|"
    r"\b(shop|commerce)\w*\b.*\b(ai|agent)\b",
    re.I,
)
PAIN_DELIVERY = re.compile(r"\b(late|lost|wrong item|delivery|shipping|tracking)\w*\b", re.I)
PAIN_REFUND = re.compile(r"\b(refund|return|chargeback|denied|reversal)\w*\b", re.I)
PAIN_QUALITY = re.compile(r"\b(fake|counterfeit|quality|damaged|not as described)\w*\b", re.I)
DESIRE_FAST = re.compile(r"\b(fast shipping|same day|quick delivery|free return)\w*\b", re.I)
DESIRE_TRUST = re.compile(r"\b(trust|transparent|honest|reliable|authentic)\w*\b", re.I)


class TrendSpotter:
    def run(self, keywords: List[str], max_results: int) -> SubAgentResult:
        res = SubAgentResult(
            agent="Trend Spotter", 
            queries=[],
            intent="Identify rising market trends and potential regulatory shifts to inform product strategy.",
            reasoning_path="Keyword-based search analysis followed by heuristic pattern matching for growth signals.",
        )
        seen_urls: set = set()
        confidence_scores = []
        for kw in keywords[:6]:
            # ... existing logic ...
            q = kw.strip()
            if not q:
                continue
            res.queries.append(q)
            for hit in web_search(q, max_results=max_results):
                if hit.url in seen_urls:
                    continue
                seen_urls.add(hit.url)
                res.hits.append(hit)
                text = f"{hit.title} {hit.snippet}"
                if hit.snippet and len(hit.snippet) > 40:
                    res.insights.append(hit.title[:100])
                if AI_COMMERCE.search(text) or TREND_RISING.search(text):
                    conf = 0.9 if AI_COMMERCE.search(text) else 0.7
                    confidence_scores.append(conf)
                    res.signals.append(
                        {
                            "signal": _short_signal(hit.title, hit.snippet),
                            "status": "rising",
                            "confidence": "high" if conf > 0.8 else "medium",
                            "keywords": _extract_keywords(text),
                            "source": hit.url,
                        }
                    )
                if REGULATION.search(text):
                    confidence_scores.append(0.6)
                    res.signals.append(
                        {
                            "signal": "Pricing regulation / surveillance pricing scrutiny",
                            "status": "rising",
                            "confidence": "medium",
                            "keywords": ["surveillance pricing", "dynamic pricing", "regulation"],
                            "source": hit.url,
                        }
                    )
                if PRICE_WAR.search(text):
                    res.alerts.append(
                        {
                            "level": "P1",
                            "trigger": f"Price competition signal: {hit.title[:80]}",
                            "action": "Audit hero SKU price index vs category leaders within 7 days",
                        }
                    )
        
        avg_conf = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.5
        res.uncertainty = 1.0 - avg_conf
        res.confidence_report = f"I am {avg_conf:.1%} confident based on {len(res.signals)} detected signals."
        
        # Uncertainty Quantification Upgrade
        res.uncertainty_details = {
            "confidence": avg_conf,
            "uncertainty_sources": ["insufficient_data" if not res.signals else "nominal"],
            "reliable_parts": ["Trend detection logic"],
            "unreliable_parts": ["Niche-specific nuances" if not res.signals else "None"],
            "recommended_action": "proceed" if avg_conf > 0.7 else "request_more_data"
        }
        
        res.insights = _dedupe_insights(res.signals, max_n=8)
        return res


class CompetitorAnalyzer:
    def run(
        self,
        niche: str,
        competitors: List[Dict[str, str]],
        templates: List[str],
        max_results: int,
    ) -> SubAgentResult:
        res = SubAgentResult(agent="Competitor Analyzer", queries=[])
        seen_urls: set = set()

        # Named competitors
        for comp in competitors[:8]:
            name = comp.get("name") or comp.get("url", "competitor")
            url = comp.get("url", "")
            q = f"{name} pricing offers reviews 2026"
            res.queries.append(q)
            findings: List[Dict[str, str]] = []
            for hit in web_search(q, max_results=max_results):
                if hit.url in seen_urls:
                    continue
                seen_urls.add(hit.url)
                res.hits.append(hit)
                findings.append(
                    {
                        "title": hit.title,
                        "snippet": hit.snippet[:300],
                        "url": hit.url,
                        "tags": _tags_from_text(hit.title + " " + hit.snippet),
                    }
                )
                if PRICE_WAR.search(hit.title + hit.snippet):
                    res.alerts.append(
                        {
                            "level": "P0",
                            "trigger": f"Competitor pricing move ({name}): {hit.title[:70]}",
                            "action": f"Compare {name} offers on overlapping SKUs; adjust promo or positioning",
                        }
                    )
            if findings:
                res.signals.append({"competitor": name, "url": url, "findings": findings})

        # Template queries for category
        for tpl in templates[:4]:
            q = _template(tpl, niche)
            res.queries.append(q)
            for hit in web_search(q, max_results=max_results):
                if hit.url in seen_urls:
                    continue
                seen_urls.add(hit.url)
                res.hits.append(hit)
                if PRICE_WAR.search(hit.title + hit.snippet):
                    res.insights.append(f"Category pricing pressure: {hit.title}")

        res.insights = list(dict.fromkeys(res.insights))[:10]
        return res


class VoiceOfCustomerAnalyzer:
    def run(self, niche: str, templates: List[str], max_results: int) -> SubAgentResult:
        res = SubAgentResult(agent="Voice of Customer Analyzer", queries=[])
        pains: List[str] = []
        desires: List[str] = []
        seen_urls: set = set()

        for tpl in templates[:5]:
            q = _template(tpl, niche)
            res.queries.append(q)
            for hit in web_search(q, max_results=max_results):
                if hit.url in seen_urls:
                    continue
                seen_urls.add(hit.url)
                res.hits.append(hit)
                text = hit.title + " " + hit.snippet
                if PAIN_DELIVERY.search(text):
                    pains.append("Delivery delays, wrong items, or poor tracking")
                if PAIN_REFUND.search(text):
                    pains.append("Refund/return friction or denied refunds")
                if PAIN_QUALITY.search(text):
                    pains.append("Product quality mismatch vs listing photos")
                if DESIRE_FAST.search(text):
                    desires.append("Faster, predictable shipping and easy returns")
                if DESIRE_TRUST.search(text):
                    desires.append("Transparent policies and trustworthy product info")

        pains = list(dict.fromkeys(pains))
        desires = list(dict.fromkeys(desires))
        res.signals.append({"pain_points": pains, "desires": desires})
        res.insights = [f"Pain: {p}" for p in pains[:5]] + [f"Desire: {d}" for d in desires[:5]]
        if pains:
            res.alerts.append(
                {
                    "level": "P1",
                    "trigger": f"VoC: top pain cluster — {pains[0]}",
                    "action": "Fix PDP imagery, tracking emails, or refund SLA on hero products",
                }
            )
        return res


def _short_signal(title: str, snippet: str) -> str:
    t = (title or snippet)[:120].strip()
    return t if len(t) > 10 else "Emerging e-commerce trend"


def _extract_keywords(text: str) -> List[str]:
    words = re.findall(r"\b[a-zA-Z]{4,}\b", text.lower())
    stop = {"that", "this", "with", "from", "their", "about", "will", "have", "been", "more"}
    freq: Dict[str, int] = {}
    for w in words:
        if w not in stop:
            freq[w] = freq.get(w, 0) + 1
    top = sorted(freq, key=freq.get, reverse=True)[:6]
    return top


def _tags_from_text(text: str) -> List[str]:
    tags = []
    if PRICE_WAR.search(text):
        tags.append("pricing")
    if re.search(r"\bfree shipping\b", text, re.I):
        tags.append("free_shipping")
    if re.search(r"\bsubscription|bundle\b", text, re.I):
        tags.append("bundle_offer")
    if re.search(r"\breview|rating\b", text, re.I):
        tags.append("reviews")
    return tags


def _dedupe_insights(signals: List[Dict[str, Any]], max_n: int) -> List[str]:
    out = []
    seen = set()
    for s in signals:
        sig = s.get("signal", "")
        if sig and sig not in seen:
            seen.add(sig)
            out.append(sig)
    return out[:max_n]
