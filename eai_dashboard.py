
from backend.core.eai.agent_factory import AgentFactory 
from backend.core.eai.self_improvement_engine import SelfImprovementEngine 
 
def get_eai_status() -> dict: 
     """ 
     Returns complete eAI system status. 
     Called by /eai/status endpoint. 
     """ 
     factory = AgentFactory() 
     improvement = SelfImprovementEngine() 
     
     agent_statuses = {} 
     for agent_id, genome in factory.registry.items(): 
         fitness = factory.fitness.get(agent_id) 
         agent_statuses[agent_id] = { 
             "generation": genome.generation, 
             "role": genome.role, 
             "status": factory.status.get(agent_id).value if agent_id in factory.status else "unknown", 
             "fitness_score": fitness.fitness_score if fitness else 0, 
             "fitness_trend": fitness.fitness_trend if fitness else "unknown",
             "deletion_risk": fitness.deletion_risk if fitness else "unknown", 
             "tasks_completed": fitness.tasks_attempted if fitness else 0, 
             "parent_id": genome.parent_id 
         } 
     
     return { 
         "eai_generation": improvement.cycle_count, 
         "total_agents": len(factory.registry), 
         "active_agents": sum( 
             1 for a in agent_statuses.values() 
             if a["status"] == "active" 
         ), 
         "condemned_agents": sum( 
             1 for a in agent_statuses.values() 
             if a["status"] == "condemned" 
         ), 
         "agents": agent_statuses, 
         "improvement_cycles_run": improvement.cycle_count, 
         "last_cycle_delta": ( 
             improvement.improvement_history[-1]["delta"] 
             if improvement.improvement_history else 0 
         ), 
         "system_fitness": sum( 
             f.fitness_score 
             for f in factory.fitness.values() 
         ) / max(len(factory.fitness), 1) 
     } 
