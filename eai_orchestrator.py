""" 
The eAI Orchestrator is the top-level coordinator. 
It runs all eAI subsystems in harmony: 
- AgentFactory: lifecycle management 
- SelfImprovementEngine: continuous evolution 
- DebateProtocol: multi-LLM consensus 
- AmbiguityDetector: metacognition 
- DriftMonitor: environmental awareness 
""" 

from typing import List, Optional, Dict, Any
import os
from backend.core.eai.agent_factory import AgentFactory
from backend.core.eai.self_improvement_engine import SelfImprovementEngine
from backend.core.drift_monitor import DriftMonitor
from backend.core.policy_registry import PolicyRegistry

class eAIOrchestrator: 
    
    def __init__(self): 
        self.factory = AgentFactory() 
        self.improvement = SelfImprovementEngine() 
        self.drift_monitor = DriftMonitor() 
        self.policy = PolicyRegistry() 
        self.is_running = False 
        self.generation = 0
        self.comm_log_path = os.path.abspath("logs/agent_comm.jsonl")
        os.makedirs(os.path.dirname(self.comm_log_path), exist_ok=True)

    def log_inter_agent_comm(self, trace_id: str, from_agent: str, to_agent: str, state_update: Dict[str, Any]):
        """Log communication between agents."""
        import json
        from datetime import datetime
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "trace_id": trace_id,
            "from_agent": from_agent,
            "to_agent": to_agent,
            "state_update": state_update
        }
        with open(self.comm_log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry) + "\n")

    def start_eai_lifecycle(self): 
        """ 
        Starts the continuous eAI lifecycle. 
        Runs forever in production. 
        
        Every 30 minutes: 
        1. Check drift 
        2. Measure agent fitness 
        3. Run improvement cycle 
        4. Condemn failing agents 
        5. Spawn replacements 
        6. Update generation counter 
        """ 
        import threading 
        import time 
        
        self.is_running = True 
        
        def lifecycle_loop(): 
            while self.is_running: 
                self.generation += 1 
                print(f"\n[eAI GENERATION {self.generation}]") 
                
                # Check for drift 
                drift = self.drift_monitor.check() 
                if drift["drifting"]: 
                    print("[!] Drift detected -- triggering emergency cycle") 
                    self._emergency_adaptation(drift) 
                
                # Run improvement cycle 
                cycle = self.improvement.run_improvement_cycle() 
                
                # Check for agents to condemn 
                condemned = self._check_and_condemn_agents() 
                if condemned: 
                    print(f"[-] Condemned {len(condemned)} agents") 
                    print(f"[+] Spawned {len(condemned)} replacements") 
                
                # Log generation summary 
                self._log_generation(cycle, condemned) 
                
                # Wait 30 minutes 
                time.sleep(30 * 60) 
        
        thread = threading.Thread( 
            target=lifecycle_loop, 
            daemon=True, 
            name="eAI-Lifecycle" 
        ) 
        thread.start() 
        print("[*] eAI Lifecycle started -- running every 30 minutes") 
        return thread 
    
    def stop_eai_lifecycle(self):
        """Stops the continuous eAI lifecycle."""
        self.is_running = False
        print("[*] eAI Lifecycle stopping...")

    def _check_and_condemn_agents(self) -> list: 
        """ 
        Reviews all agents for condemnation eligibility. 
        """ 
        condemned = [] 
        
        for agent_id, fitness in self.factory.fitness.items(): 
            if fitness.deletion_risk == "imminent": 
                result = self.factory._condemn_agent( 
                    agent_id=agent_id, 
                    reason="fitness_below_threshold" 
                ) 
                if result["status"] == "condemned": 
                    condemned.append(agent_id) 
        
        return condemned 
    
    def _emergency_adaptation(self, drift: dict): 
        """ 
        Fast adaptation when sudden drift detected. 
        Does NOT wait for next scheduled cycle. 
        """ 
        print("[!!] Emergency adaptation triggered") 
        
        # Immediate rollback to last known good state 
        last_good_token = self.policy.get_last_stable_token() 
        if last_good_token: 
            self.policy.rollback(last_good_token) 
            print("  Rolled back to last stable configuration") 
        
        # Run accelerated improvement cycle 
        self.improvement.run_improvement_cycle()

    def _log_generation(self, cycle: dict, condemned: list):
        """Logs generation summary."""
        # In a real system, this would write to a database or persistent log
        pass
