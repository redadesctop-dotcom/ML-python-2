from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any
import asyncio
from pathlib import Path
from backend.core.eai.agent_factory import AgentFactory
from backend.core.eai.eai_orchestrator import eAIOrchestrator
from backend.core.debate_protocol import DebateProtocol

router = APIRouter(prefix="/api/build", tags=["build"])

class BuildRequest(BaseModel):
    project_name: str
    description: str

@router.post("")
async def build_project(request: BuildRequest):
    factory = AgentFactory()
    orchestrator = eAIOrchestrator()
    project_root = orchestrator.project_root if hasattr(orchestrator, 'project_root') else "."
    
    trace_id = f"build_{request.project_name}_{int(asyncio.get_event_loop().time())}"
    
    # 1. Spawn SCOUT Agent
    scout_genome = factory.spawn_via_api({
        "role": "SCOUT",
        "specialization": "Requirements Analysis",
        "project": request.project_name
    })
    orchestrator.log_inter_agent_comm(trace_id, "SYSTEM", scout_genome.agent_id, {"action": "ANALYZE_SPEC", "spec": request.description})
    
    # 2. Spawn FORGE Agent
    forge_genome = factory.spawn_via_api({
        "role": "FORGE",
        "specialization": "Code Generation",
        "parent_id": scout_genome.agent_id
    })
    orchestrator.log_inter_agent_comm(trace_id, scout_genome.agent_id, forge_genome.agent_id, {"action": "GENERATE_CODE", "context": "E-commerce scaffold"})

    project_path = Path("generated_project") / request.project_name
    project_path.mkdir(parents=True, exist_ok=True)
    
    file_targets = [
        ("backend/main.py", "Write a complete FastAPI backend for: " + request.description),
        ("README.md", "Write a professional README for: " + request.description)
    ]
    
    created_files = []
    debate = DebateProtocol()
    for rel_path, prompt in file_targets:
        debate_result = debate.run_debate(prompt, {})
        code_content = debate_result["final_answer"]
        
        full_path = project_path / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(code_content)
        created_files.append(rel_path)
    
    return {
        "status": "native_project_built",
        "project_location": str(project_path),
        "files_created": created_files,
        "trace_id": trace_id
    }
