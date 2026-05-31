"""AGENT_REGISTRY — Production agent definitions."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

from config.config import MAX_CONCURRENT_AGENTS

class Plane(str, Enum):
    MAIN = "MAIN"
    SUB = "SUB"

@dataclass(frozen=True)
class AgentSpec:
    id: int
    name: str
    plane: Plane
    role: str
    capabilities: List[str]
    complexity_threshold: float = 0.0

AGENT_REGISTRY: Dict[str, AgentSpec] = {
    "Prime_Orchestrator": AgentSpec(1, "Prime_Orchestrator", Plane.MAIN, "Hierarchical planning", ["dag", "validate"]),
    "Dynamic_Router": AgentSpec(2, "Dynamic_Router", Plane.MAIN, "Task routing", ["route"]),
    "State_Auditor": AgentSpec(3, "State_Auditor", Plane.MAIN, "Memory governance", ["checkpoint"]),
    "Architect_Synth": AgentSpec(4, "Architect_Synth", Plane.SUB, "Architecture proposal", ["design"]),
    "Core_Developer": AgentSpec(6, "Core_Developer", Plane.SUB, "Implementation", ["implement"]),
    "Deep_Research_Engine": AgentSpec(9, "Deep_Research_Engine", Plane.SUB, "Research", ["research"]),
    "Critique_Evaluator": AgentSpec(13, "Critique_Evaluator", Plane.SUB, "Evaluation", ["validate"]),
}

MAIN_AGENTS = [k for k, v in AGENT_REGISTRY.items() if v.plane == Plane.MAIN]
SUB_AGENTS = [k for k, v in AGENT_REGISTRY.items() if v.plane == Plane.SUB]

MAX_RETRY = 3
HARD_TIMEOUT_S = 900
