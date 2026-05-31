"""MASTER_ORCHESTRATOR — Production hierarchical loop protocol."""

from __future__ import annotations

import json
import uuid
import hashlib
import structlog
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from config.config import settings
from .logging_config import setup_logging
from .agent_handlers import (
    execute_agent, 
    run_terminal,
)

# Initialize production logging
logger = setup_logging()

def _cycle_id() -> str:
    return f"cycle_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:6]}"

def run_cycle(objective: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Execute PRODUCTION_QUALITY_PROTOCOL:
    RESEARCH → DESIGN → IMPLEMENT → TEST → EVALUATE → MERGE
    """
    payload = payload or {}
    cycle_id = _cycle_id()
    state_file = settings.STATE_DIR / f"{cycle_id}_state.json"
    
    logger.info("cycle_start", cycle_id=cycle_id, objective=objective)
    
    report: Dict[str, Any] = {
        "cycle_id": cycle_id,
        "objective": objective,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    def save_state(step_name: str, step_data: Any):
        report[step_name] = step_data
        try:
            state_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error("state_save_error", step=step_name, error=str(e))

    # --- 1. RESEARCH ---
    logger.info("phase_research_start")
    research_res = execute_agent("Deep_Research_Engine", f"Research: {objective}", {}, cycle_id)
    save_state("MASTER_THOUGHT", {
        "problem_decomposition": f"Decomposing objective: {objective[:100]}...",
        "research_findings": research_res.get("output", {}),
    })

    # --- 2. ARCHITECTURE ---
    logger.info("phase_architecture_start")
    arch_proposals = execute_agent("Architect_Synth", "Propose architectures", {"research": research_res}, cycle_id)
    selected_arch = arch_proposals.get("output", {}).get("proposals", [{}])[0].get("name", "Standard Service")
    report["MASTER_THOUGHT"]["selected_architecture"] = selected_arch
    save_state("MASTER_THOUGHT", report["MASTER_THOUGHT"])
    
    # --- 3. IMPLEMENTATION ---
    logger.info("phase_implementation_start")
    impl_res = execute_agent("Core_Developer", f"Implement {objective}", {"arch": selected_arch}, cycle_id)
    save_state("IMPLEMENTATION", impl_res)
    
    # --- 4. TESTING ---
    logger.info("phase_testing_start")
    test_res = run_terminal("pytest --cov=src", timeout=settings.DEFAULT_TIMEOUT)
    save_state("TESTING", test_res)
    
    # --- 5. EVALUATION ---
    logger.info("phase_evaluation_start")
    eval_res = execute_agent("Critique_Evaluator", "Evaluate implementation and tests", {"impl": impl_res, "tests": test_res}, cycle_id)
    quality_score = eval_res.get("output", {}).get("quality_score", 0.0)
    
    report["RUNTIME_OBSERVATION"] = {
        "test_logs": test_res["stdout"] if test_res["status"] == "OK" else test_res["stderr"],
        "quality_report": eval_res["output"]
    }
    save_state("RUNTIME_OBSERVATION", report["RUNTIME_OBSERVATION"])

    status = "PASS" if quality_score >= 0.85 else "FAIL"
    logger.info("cycle_complete", cycle_id=cycle_id, status=status, quality_score=quality_score)

    report["REFLECT"] = {
        "status": status,
        "quality_score": quality_score,
        "coverage_pct": test_res.get("coverage_pct", 0.0),
        "security_flags": eval_res.get("output", {}).get("security_flags", 0),
        "notes": eval_res.get("output", {}).get("critique", "")
    }
    save_state("REFLECT", report["REFLECT"])

    if status == "PASS":
        # --- 6. MERGE ---
        logger.info("phase_merge_start")
        report["MERGE"] = {
            "diff_hash": hashlib.sha256(json.dumps(impl_res).encode()).hexdigest()[:12],
            "acceptance": "ACCEPTED"
        }
        save_state("MERGE", report["MERGE"])

    return report
