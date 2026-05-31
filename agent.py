"""Market Intelligence Agent — orchestrates sub-agents, KB, learning, and reports."""

from __future__ import annotations

import json
import structlog
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from config.config import settings
from . import kb as kb_mod
from .learning import register_cycle_predictions, run_self_learning
from .reporter import build_report
from .subagents import CompetitorAnalyzer, TrendSpotter, VoiceOfCustomerAnalyzer

# eAI Core Components
from backend.core.perceptual_indexer import PerceptualIndexer
from backend.core.reasoning import SharedReasoningContext
from backend.core.policy import ActionPolicyEngine, ActionType
from memory.episodic import EpisodicMemory
from backend.core.communication import ExplainabilityLayer, NegotiationProtocol
from backend.core.metacognition import AmbiguityDetector

logger = structlog.get_logger()

# Use consolidated config from config/config.py
CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def load_config(path: Path = CONFIG_PATH) -> Dict[str, Any]:
    if path.exists():
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error("config_load_error", path=str(path), error=str(e))
    return {}


def run_intelligence_cycle(
    config_path: Optional[Path] = None,
    kb_path: Optional[Path] = None,
    write_report: bool = True,
) -> str:
    logger.info("cycle_start", config_path=str(config_path))
    
    # Initialize eAI Components
    perceptual_indexer = PerceptualIndexer()
    reasoning_context = SharedReasoningContext()
    policy_engine = ActionPolicyEngine()
    episodic_memory = EpisodicMemory()
    explainability = ExplainabilityLayer(reasoning_context)
    
    # Mock LLM client for components that need it
    class MockLLM:
        def query(self, p): return {"confidence_to_proceed": 0.9, "answer": "mock"}
    mock_llm = MockLLM()
    
    ambiguity_detector = AmbiguityDetector(mock_llm)
    
    # PERCEIVE: Continuous monitoring
    observation = perceptual_indexer.observe()
    perceptual_context = perceptual_indexer.get_context_for_agent()
    
    config = load_config(config_path or CONFIG_PATH)
    
    # Metacognition: Ambiguity Check
    niche = config.get("niche") or settings.MARKET_NICHE
    ambiguity_res = ambiguity_detector.analyze(f"Market research for {niche}")
    if ambiguity_res["action"] == "ASK_USER":
        return f"Clarification needed: {ambiguity_res['question']}"
    
    kb = kb_mod.load_kb(kb_path or kb_mod.KB_PATH)
    kb_mod.merge_config_into_kb(kb, config)
    
    # Record input pattern for shift detection
    perceptual_indexer.record_input_pattern(config)

    niche = config.get("niche") or settings.MARKET_NICHE
    geography = config.get("geography") or settings.MARKET_GEOGRAPHY
    max_r = int(config.get("max_search_results_per_query") or settings.MAX_SEARCH_RESULTS)
    competitors = config.get("competitors") or []

    cycle_id = f"cycle_{datetime.now().strftime('%Y-%m-%d_%H%M')}"
    
    # REASON & ACT: Decide approach based on policy
    action_type = policy_engine.select_action({"perceptual_context": perceptual_context})
    logger.info("eai_action_selected", action=action_type.value)
    
    if action_type == ActionType.DEFER:
        logger.info("eai_action_defer", reason="High uncertainty or policy-driven escalation")
        return "Action deferred to human oversight due to high system uncertainty."

    # --- Sub-agents ---
    trend_kw = config.get("trend_keywords") or kb["meta"].get("trend_keywords") or [
        f"{niche} trends 2026",
        f"{niche} AI shopping",
    ]
    
    logger.info("running_subagents", trend_kw=trend_kw, competitors=competitors)
    
    # Run sub-agents and record their communicative metadata
    trend = TrendSpotter().run(trend_kw, max_results=max_r)
    reasoning_context.record_conclusion(
        agent_id="TrendSpotter",
        conclusion=f"Found {len(trend.signals)} signals",
        confidence=1.0 - trend.uncertainty,
        reasoning=trend.reasoning_path
    )
    
    competitor = CompetitorAnalyzer().run(
        niche,
        competitors,
        config.get("competitor_search_templates", []),
        max_r,
    )
    # Note: CompetitorAnalyzer and VOC would need similar updates to subagents.py for full eAI metadata
    
    voc = VoiceOfCustomerAnalyzer().run(
        niche,
        config.get("voc_search_templates", []),
        max_r,
    )

    # Experience Memory: Retrieve past relevant episodes
    past_episodes = episodic_memory.retrieve_relevant_episodes(perceptual_context)
    if past_episodes:
        logger.info("eai_memory_retrieved", count=len(past_episodes))
        # Context injection from memory could happen here

    # --- Persist to Knowledge Base ---
    # ... existing persistence logic ...
    for sig in trend.signals:
        kb_mod.upsert_trend(
            kb,
            signal=sig.get("signal", "Trend signal"),
            status=sig.get("status", "rising"),
            confidence=sig.get("confidence", "medium"),
            keywords=sig.get("keywords", []),
            sources=[sig.get("source", "")],
        )

    for sig in competitor.signals:
        if "competitor" in sig:
            kb_mod.update_competitor_profile(
                kb,
                name=sig["competitor"],
                url=sig.get("url"),
                findings=sig.get("findings", []),
            )

    voc_sig = voc.signals[0] if voc.signals else {}
    kb_mod.add_sentiment_snapshot(
        kb,
        pains=voc_sig.get("pain_points", []),
        desires=voc_sig.get("desires", []),
        sources=[h.url for h in voc.hits[:10]],
    )

    for agent_res in (trend, competitor, voc):
        for alert in agent_res.alerts:
            kb_mod.add_alert(kb, alert["level"], alert["trigger"], alert["action"])

    cycle_signals = {
        "trend_signals": trend.signals,
        "competitor_signals": competitor.signals,
        "voc_pains": voc_sig.get("pain_points", []),
        "voc_desires": voc_sig.get("desires", []),
        "alerts": trend.alerts + competitor.alerts + voc.alerts,
    }
    
    # Self-learning / Prediction register
    register_cycle_predictions(kb, cycle_signals)
    
    # Run learning calibration periodically (simulated here)
    learning_summary = run_self_learning(kb, cycle_signals)
    logger.info("learning_complete", summary=learning_summary)

    # Save KB
    kb_mod.save_kb(kb, kb_path or kb_mod.KB_PATH)

    # Build report
    report = build_report(cycle_id, niche, trend, competitor, voc, learning_summary)
    
    # ADAPT: Record episode and update policy
    success = len(trend.signals) > 0 or len(competitor.signals) > 0 or len(voc.signals) > 0
    reward = 1.0 if success else -0.5
    policy_engine.record_outcome(action_type, success, reward)
    episodic_memory.record_episode(
        agent_id="MarketIntelOrchestrator",
        context={"summary": perceptual_context, "niche": niche},
        decision=action_type.value,
        outcome_reward=reward
    )
    
    # Explainability: Generate explanation for the cycle
    cycle_explanation = explainability.generate_explanation(cycle_id, {"perceptual_context": perceptual_context})
    logger.info("eai_explanation", explanation=cycle_explanation)

    if write_report:
        # Append explanation to report
        report += f"\n\n## eAI Explainability Layer\n{cycle_explanation}\n"
        
        report_path = settings.REPORTS_DIR / f"{cycle_id}.md"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report)
        # Also symlink/copy to latest.md
        latest_path = settings.REPORTS_DIR / "latest.md"
        with open(latest_path, "w", encoding="utf-8") as f:
            f.write(report)
        logger.info("report_generated", path=str(report_path))

    return report
