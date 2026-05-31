import uuid
import hashlib
import json
import random
import os
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List, Any
from enum import Enum

class AgentStatus(Enum):
    EMBRYO = "embryo" # Created, not yet tested
    TRIAL = "trial" # In probation period
    ACTIVE = "active" # Passed fitness threshold
    DEGRADED = "degraded" # Performance declining
    CONDEMNED = "condemned" # Marked for deletion
    ARCHIVED = "archived" # Deleted but audited

@dataclass
class AgentGenome:
    """
    Every agent has a 'genome' — its configuration.
    Genomes can be mutated to create better agents.
    """
    agent_id: str
    parent_id: Optional[str] # Which agent spawned this
    generation: int # Evolution generation
    role: str # What this agent does
    llm_engine: str # groq|openai|gemini
    system_prompt: str # Agent's instructions
    temperature: float # Creativity level
    max_tokens: int # Response size
    specialization: str # Domain expertise
    mutation_history: list = field(default_factory=list)
    created_at: str = field(
        default_factory=lambda: datetime.now().isoformat()
    )

    @property
    def dict(self):
        return asdict(self)

@dataclass
class AgentFitnessRecord:
    """
    Tracks every agent's performance over time.
    This is how the system knows who to delete.
    """
    agent_id: str
    tasks_attempted: int = 0
    tasks_succeeded: int = 0
    tasks_failed: int = 0
    avg_confidence: float = 0.0
    avg_latency_ms: float = 0.0
    false_positive_rate: float = 0.0
    false_negative_rate: float = 0.0
    last_10_scores: list = field(default_factory=list)
    fitness_trend: str = "unknown" # improving|stable|declining
    fitness_score: float = 0.0 # 0.0 to 1.0
    deletion_risk: str = "low" # low|medium|high|imminent

    @property
    def dict(self):
        return asdict(self)

class AgentFactory:
    """
    Creates, monitors, and destroys agents based on fitness.
    """
    
    FITNESS_THRESHOLD_TRIAL_PROMOTION = 0.72
    FITNESS_THRESHOLD_ACTIVE_MINIMUM  = 0.65
    FITNESS_THRESHOLD_CONDEMNATION    = 0.60
    TRIAL_MINIMUM_TASKS               = 50
    CONDEMNATION_EPOCHS               = 3
    CONSECUTIVE_FAILURE_LIMIT         = 5
    
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AgentFactory, cls).__new__(cls)
            cls._instance.init()
        return cls._instance

    def init(self):
        self.registry: Dict[str, AgentGenome] = {}        # agent_id → AgentGenome
        self.fitness: Dict[str, AgentFitnessRecord] = {}  # agent_id → AgentFitnessRecord
        self.status: Dict[str, AgentStatus] = {}
        self.audit_log = []       # Immutable audit trail
        self._load_existing_agents()
    
    def _load_existing_agents(self):
        # Placeholder for persistence
        pass

    def spawn_via_api(self, spec: Dict[str, Any]) -> AgentGenome:
        """Spawn an agent using the ModelRouter via API calls."""
        import json
        
        role = spec.get("role", "generalist")
        specialization = spec.get("specialization", "generic")
        
        # Create agent genome without async operations (simplify for thread safety)
        genome = self.spawn_agent(
            role=role,
            specialization=specialization,
            parent_id=spec.get("parent_id")
        )
        
        # Log to agent_spawn.jsonl
        log_path = os.path.abspath("logs/agent_spawn.jsonl")
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        
        spawn_log = {
            "timestamp": datetime.now().isoformat(),
            "agent_id": genome.agent_id,
            "role": genome.role,
            "specialization": genome.specialization,
            "spec_input": spec
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(spawn_log) + "\n")
        
        return genome

    # ─── CREATION ───────────────────────────────────────
    
    def spawn_agent(
        self,
        role: str,
        specialization: str,
        parent_id: Optional[str] = None,
        mutation_type: str = "random"
    ) -> AgentGenome:
        agent_id = f"agent_{uuid.uuid4().hex[:8]}"
        
        if parent_id and parent_id in self.registry:
            genome = self._mutate_genome(
                parent=self.registry[parent_id],
                mutation_type=mutation_type,
                new_id=agent_id
            )
        else:
            genome = self._create_base_genome(
                agent_id=agent_id,
                role=role,
                specialization=specialization
            )
        
        self.registry[agent_id] = genome
        self.fitness[agent_id] = AgentFitnessRecord(agent_id=agent_id)
        self._update_status(agent_id, AgentStatus.EMBRYO)
        
        self._audit(
            event="AGENT_SPAWNED",
            agent_id=agent_id,
            parent_id=parent_id,
            details={"role": role, "specialization": specialization}
        )
        
        print(f"[AgentFactory] Spawned: {agent_id} | Role: {role} | Parent: {parent_id or 'none'}")
        return genome
    
    def _create_base_genome(self, agent_id: str, role: str, specialization: str) -> AgentGenome:
        return AgentGenome(
            agent_id=agent_id,
            parent_id=None,
            generation=0,
            role=role,
            llm_engine="groq",
            system_prompt=f"You are a {role} specializing in {specialization}.",
            temperature=0.7,
            max_tokens=512,
            specialization=specialization
        )

    def _mutate_genome(self, parent: AgentGenome, mutation_type: str, new_id: str) -> AgentGenome:
        import copy
        child = copy.deepcopy(parent)
        child.agent_id = new_id
        child.parent_id = parent.agent_id
        child.generation = parent.generation + 1
        
        if mutation_type == "temperature":
            delta = random.uniform(-0.1, 0.1)
            child.temperature = max(0.1, min(1.0, parent.temperature + delta))
            child.mutation_history.append(f"temperature:{parent.temperature:.2f}→{child.temperature:.2f}")
        elif mutation_type == "prompt":
            child.system_prompt += " (Evolved)"
            child.mutation_history.append("prompt_evolved")
        elif mutation_type == "specialization":
            child.specialization += " (Refined)"
            child.mutation_history.append(f"spec:{parent.specialization}→{child.specialization}")
        else: # hybrid
            child.temperature = max(0.1, min(1.0, parent.temperature + random.uniform(-0.05, 0.05)))
            child.mutation_history.append("hybrid_mutation")
            
        return child

    # ─── FITNESS MEASUREMENT ────────────────────────────
    
    def record_task_result(
        self,
        agent_id: str,
        success: bool,
        confidence: float,
        latency_ms: float,
        task_difficulty: int = 1
    ) -> AgentFitnessRecord:
        if agent_id not in self.fitness:
            raise ValueError(f"Unknown agent: {agent_id}")
        
        record = self.fitness[agent_id]
        record.tasks_attempted += 1
        
        if success:
            record.tasks_succeeded += 1
        else:
            record.tasks_failed += 1
        
        record.avg_confidence = ((record.avg_confidence * (record.tasks_attempted - 1) + confidence) / record.tasks_attempted)
        record.avg_latency_ms = ((record.avg_latency_ms * (record.tasks_attempted - 1) + latency_ms) / record.tasks_attempted)
        
        task_score = (1.0 if success else 0.0) * confidence
        record.last_10_scores.append(task_score)
        if len(record.last_10_scores) > 10:
            record.last_10_scores.pop(0)
        
        record.fitness_score = self._compute_fitness(record)
        
        if len(record.last_10_scores) >= 5:
            half = len(record.last_10_scores) // 2
            first_half = sum(record.last_10_scores[:half]) / half
            second_half = sum(record.last_10_scores[half:]) / (len(record.last_10_scores) - half)
            if second_half > first_half + 0.05:
                record.fitness_trend = "improving"
            elif second_half < first_half - 0.05:
                record.fitness_trend = "declining"
            else:
                record.fitness_trend = "stable"
        
        record.deletion_risk = self._assess_deletion_risk(record)
        
        if record.deletion_risk == "imminent":
            self._condemn_agent(agent_id, reason="fitness_below_threshold")
        
        return record
    
    def _compute_fitness(self, record: AgentFitnessRecord) -> float:
        if record.tasks_attempted == 0:
            return 0.0
        success_rate = record.tasks_succeeded / record.tasks_attempted
        calibration_penalty = max(0, record.avg_confidence - success_rate) * 0.5
        latency_score = max(0, 1.0 - (record.avg_latency_ms / 2000))
        fitness = (0.60 * success_rate + 0.25 * (1.0 - calibration_penalty) + 0.15 * latency_score)
        return round(fitness, 4)
    
    def _assess_deletion_risk(self, record: AgentFitnessRecord) -> str:
        if record.fitness_score >= 0.75: return "low"
        elif record.fitness_score >= 0.65: return "medium"
        elif record.fitness_score >= 0.60: return "high"
        else: return "imminent"

    # ─── DELETION (CONDEMNATION) ─────────────────────────
    
    def _condemn_agent(self, agent_id: str, reason: str) -> dict:
        genome = self.registry.get(agent_id)
        if not genome:
            return {"error": "agent_not_found"}
        
        print(f"\n[AgentFactory] [WARNING] CONDEMNING: {agent_id}")
        print(f"  Reason: {reason}")
        print(f"  Fitness: {self.fitness[agent_id].fitness_score}")
        
        # Step 1: Statistical proof this agent is worse
        try:
            from backend.core.causal_validator import CausalValidator
            cv = CausalValidator()
            peer_scores = self._get_peer_fitness_scores(genome.role, exclude=agent_id)
            agent_scores = self.fitness[agent_id].last_10_scores
            
            if len(peer_scores) >= 5 and len(agent_scores) >= 5:
                # Assuming validate returns a dict with 'significant' key
                validation = cv.validate(agent_scores, peer_scores)
                # Handle different return formats from previous implementations
                is_sig = validation.get("significant") if isinstance(validation, dict) else False
                if not is_sig:
                    print(f"  CausalValidator: NOT statistically worse than peers — REPRIEVE granted")
                    self._audit("CONDEMNATION_REPRIEVED", agent_id, None, {"reason": "not_statistically_worse"})
                    return {"status": "reprieved"}
        except Exception as e:
            print(f"  CausalValidator error: {e}. Proceeding with condemnation.")

        # Step 2: Archive
        genome_backup = {
            "genome": genome.dict,
            "fitness": self.fitness[agent_id].dict,
            "condemned_at": datetime.now().isoformat(),
            "condemned_reason": reason
        }
        self._archive_agent(agent_id, genome_backup)
        
        # Step 3: Update status
        self._update_status(agent_id, AgentStatus.CONDEMNED)
        
        # Step 4: Find best parent for replacement
        best_peer = self._find_best_agent_by_role(genome.role)
        
        # Step 5: Spawn replacement
        replacement_id = None
        if best_peer:
            replacement = self.spawn_agent(
                role=genome.role,
                specialization=genome.specialization,
                parent_id=best_peer,
                mutation_type="hybrid"
            )
            replacement_id = replacement.agent_id
            print(f"  Replacement spawned: {replacement_id}")
        
        # Step 6: Audit
        self._audit(
            event="AGENT_CONDEMNED",
            agent_id=agent_id,
            parent_id=None,
            details={
                "reason": reason,
                "final_fitness": self.fitness[agent_id].fitness_score,
                "replacement": replacement_id,
                "archived": True
            }
        )
        
        return {
            "status": "condemned",
            "agent_id": agent_id,
            "replacement": replacement_id,
            "archived": True
        }

    def _get_peer_fitness_scores(self, role: str, exclude: str) -> List[float]:
        scores = []
        for aid, genome in self.registry.items():
            if aid != exclude and genome.role == role and aid in self.fitness:
                scores.extend(self.fitness[aid].last_10_scores)
        return scores

    def _find_best_agent_by_role(self, role: str) -> Optional[str]:
        best_aid = None
        best_score = -1.0
        for aid, genome in self.registry.items():
            if genome.role == role and aid in self.fitness:
                if self.fitness[aid].fitness_score > best_score:
                    best_score = self.fitness[aid].fitness_score
                    best_aid = aid
        return best_aid

    def _archive_agent(self, agent_id: str, data: dict):
        self._update_status(agent_id, AgentStatus.ARCHIVED)
        # Persistence would go here

    def _update_status(self, agent_id: str, status: AgentStatus):
        self.status[agent_id] = status

    def _get_status(self, agent_id: str) -> AgentStatus:
        return self.status.get(agent_id, AgentStatus.EMBRYO)

    # ─── AUDIT ──────────────────────────────────────────
    
    def _audit(self, event: str, agent_id: str, parent_id: Optional[str], details: dict):
        entry = {
            "event_id": hashlib.sha256(f"{event}{agent_id}{datetime.now().isoformat()}".encode()).hexdigest()[:16],
            "timestamp": datetime.now().isoformat(),
            "event": event,
            "agent_id": agent_id,
            "parent_id": parent_id,
            "details": details
        }
        self.audit_log.append(entry)
        os.makedirs("logs", exist_ok=True)
        with open("logs/agent_factory_audit.jsonl", "a") as f:
            f.write(json.dumps(entry) + "\n")
