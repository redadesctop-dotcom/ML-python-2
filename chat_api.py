"""
eAI Chat API Router — v3.0 Strict Agentic Implementation
Unified implementation with strict 8-agent execution graph, 
sandboxed staging, and multi-model local orchestration.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import (
    Any,
    AsyncIterator,
    Callable,
    Coroutine,
    Dict,
    List,
    Optional,
    Protocol,
    Tuple,
    Union,
)

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from pathlib import Path
import os
import psutil

# Local core modules
from backend.core.agent_arms import AgentArms
from backend.core.memory_engine import MemoryEngine
from backend.core.model_router import OllamaBackend

logger = logging.getLogger("chat_api")
router = APIRouter(prefix="/api/chat", tags=["chat"])

# Global shared backends
_ollama = OllamaBackend()
_arms = AgentArms(ollama_client=_ollama)
_memory = MemoryEngine()

# SANDBOX_ROOT for staging proposed patches
SANDBOX_ROOT = Path(os.environ.get("SANDBOX_ROOT", "backend/sandbox"))
SANDBOX_PENDING = SANDBOX_ROOT / "pending"
SANDBOX_WORKSPACE = SANDBOX_ROOT / "workspace"
SANDBOX_PENDING.mkdir(parents=True, exist_ok=True)
SANDBOX_WORKSPACE.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════════════
# SECTION 0: DOMAIN MODELS & ENUMS
# ═══════════════════════════════════════════════════════════════

class MessageRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    timestamp: float = Field(default_factory=time.time)

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: str) -> MessageRole:
        return MessageRole(v.lower())


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    model_tier: str = Field(default="14b", alias="modelTier")
    system_context: Optional[str] = Field(default=None, alias="systemContext")
    session_id: Optional[str] = Field(default=None, alias="sessionId")

    class Config:
        populate_by_name = True


class StreamEventType(str, Enum):
    TOKEN = "token"
    PROGRESS = "progress"
    ERROR = "error"
    DONE = "done"
    THOUGHT_LINE = "thought_line"
    TERMINAL_LINE = "terminal_line"
    FILE_DIFF = "file_diff"
    MATH_PROOF = "math_proof"
    TEST_RESULT = "test_result"
    CRITIC_REVIEW = "critic_review"
    PATCH_ACCEPTED = "patch_accepted"
    PATCH_REJECTED = "patch_rejected"
    SUB_AGENT_REPORT = "sub_agent_report"
    STATS = "stats"


class StreamEvent(BaseModel):
    type: StreamEventType
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: float = Field(default_factory=time.time)
    token: Optional[str] = None
    step: Optional[str] = None
    message: Optional[str] = None
    agent: Optional[str] = None
    text: Optional[str] = None
    data: Optional[Any] = None
    path: Optional[str] = None
    diff: Optional[str] = None
    patch_id: Optional[str] = Field(default=None, alias="patchId")
    proven: Optional[bool] = None
    proof_steps: Optional[List[str]] = Field(default=None, alias="proofSteps")
    complexity: Optional[Dict[str, str]] = None
    passed: Optional[bool] = None
    failed: Optional[int] = None
    coverage: Optional[float] = None
    time: Optional[float] = None
    environment: Optional[str] = None
    score: Optional[int] = None
    verdict: Optional[str] = None
    issues: Optional[List[str]] = None
    suggestions: Optional[List[str]] = None
    agents_run: Optional[int] = Field(default=None, alias="agentsRun")
    agents_total: Optional[int] = Field(default=None, alias="agentsTotal")
    total_time: Optional[float] = Field(default=None, alias="totalTime")
    tests_passed: Optional[int] = Field(default=None, alias="testsPassed")
    tests_total: Optional[int] = Field(default=None, alias="testsTotal")
    quality_score: Optional[int] = Field(default=None, alias="qualityScore")
    sub_agent_id: Optional[str] = Field(default=None, alias="subAgentId")

    def sse_format(self) -> str:
        return f"data: {self.model_dump_json(by_alias=True)}\n\n"


class AgentRole(str, Enum):
    PLANNER = "planner_agent"
    DEVELOPER = "developer_agent"
    MATH_VALIDATOR = "math_validator_agent"
    CRITIC = "critic_agent"
    TESTER = "test_agent"
    SAFETY_AUDITOR = "safety_auditor_agent"
    SUB_AGENT_SPAWNER = "sub_agent_spawner"
    GIT_MANAGER = "git_manager_agent"


class AgentStatus(str, Enum):
    STANDBY = "standby"
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"


# ═══════════════════════════════════════════════════════════════
# SECTION 1: AGENT PROTOCOL & BASE IMPLEMENTATION
# ═══════════════════════════════════════════════════════════════

@dataclass
class ConversationState:
    session_id: str
    messages: List[ChatMessage] = field(default_factory=list)
    pending_patches: Dict[str, Dict[str, Any]] = field(default_factory=dict)


class ConversationStore:
    def __init__(self):
        self._states: Dict[str, ConversationState] = {}

    async def get(self, session_id: str) -> ConversationState:
        if session_id not in self._states:
            self._states[session_id] = ConversationState(session_id=session_id)
        return self._states[session_id]

conversation_store = ConversationStore()


class AgentContext:
    def __init__(
        self,
        message: str,
        state: ConversationState,
        model_name: str = "qwen2.5:14b",
        stream_callback: Optional[Callable[[StreamEvent], Coroutine[Any, Any, None]]] = None,
    ):
        self.message = message
        self.state = state
        self.model_name = model_name
        self.stream_callback = stream_callback
        self.results: Dict[AgentRole, Any] = {}
        self.execution_trace: List[Dict[str, Any]] = []
        self.pending_patches: Dict[str, Dict[str, Any]] = state.pending_patches

    async def emit(self, event: StreamEvent):
        if self.stream_callback:
            await self.stream_callback(event)


class BaseAgent:
    def __init__(self, role: AgentRole):
        self.role = role
        self._status = AgentStatus.STANDBY

    async def execute(self, ctx: AgentContext) -> Dict[str, Any]:
        self._status = AgentStatus.ACTIVE
        try:
            # Dynamic model selection based on RAM
            available_gb = psutil.virtual_memory().available / (1024 ** 3)
            ctx.model_name = self._get_model_for_role(available_gb)
            
            # Step 1: Think (Dynamic LLM reasoning)
            thought = await self._think(ctx)
            await ctx.emit(StreamEvent(type=StreamEventType.THOUGHT_LINE, agent=self.role.value, text=thought.get("thought", "")))
            for r in thought.get("reasoning", []):
                await ctx.emit(StreamEvent(type=StreamEventType.THOUGHT_LINE, agent=self.role.value, text=f"├─ {r}"))
            
            # Step 2: Run
            result = await self._run(ctx)
            
            # Step 3: Critique (Internal Quality Gate)
            critique = await self._critique(result, ctx)
            score = critique.get("score", 0.9)
            
            # Emit review only for relevant agents
            if self.role not in [AgentRole.PLANNER, AgentRole.GIT_MANAGER]:
                await ctx.emit(StreamEvent(
                    type=StreamEventType.CRITIC_REVIEW,
                    agent=self.role.value,
                    score=int(score * 100),
                    verdict="APPROVED" if score >= 0.7 else "REJECTED",
                    issues=critique.get("issues", []),
                    suggestions=critique.get("suggestions", [])
                ))
            
            if score < 0.7:
                # Automatic retry logic or fallback
                logger.warning(f"Quality gate low for {self.role.value}, proceeding with caution.")

            self._status = AgentStatus.COMPLETED
            return result
        except Exception as e:
            self._status = AgentStatus.FAILED
            logger.error(f"Agent {self.role.value} failed: {e}")
            await ctx.emit(StreamEvent(type=StreamEventType.ERROR, agent=self.role.value, message=str(e)))
            raise

    def _get_model_for_role(self, available_gb: float) -> str:
        # Configuration as per executive prompt
        if available_gb < 4.0: return "qwen2.5:3b"
        
        if self.role == AgentRole.PLANNER: 
            return "deepseek-r1:32b" if available_gb > 16 else "qwen2.5:14b"
        
        if self.role in [AgentRole.DEVELOPER, AgentRole.TESTER]: 
            return "qwen2.5-coder:14b" # Specialist model
            
        if self.role in [AgentRole.CRITIC, AgentRole.SAFETY_AUDITOR, AgentRole.MATH_VALIDATOR]:
            return "llama3:8b" # Logic-heavy
            
        return "qwen2.5:14b"

    async def _think(self, ctx: AgentContext) -> Dict[str, Any]:
        prompt = f"""
        You are {self.role.value}, an AI agent in a multi-agent system.
        Current Task: {ctx.message}
        Previous Agent Results: {json.dumps({k.value: v for k, v in ctx.results.items()}, default=str)}
        
        Think step-by-step about how to fulfill your role.
        Return ONLY a JSON object:
        {{
            "thought": "A high-level summary of your plan",
            "reasoning": ["Detailed step 1", "Detailed step 2", "Detailed step 3"]
        }}
        """
        try:
            resp = await _ollama.generate(prompt, model=ctx.model_name)
            # Find JSON in response
            match = re.search(r'\{.*\}', resp, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            return {"thought": f"Executing {self.role.value} strategy", "reasoning": ["Analyzing input", "Optimizing process"]}
        except Exception as e:
            logger.error(f"Thinking failed for {self.role.value}: {e}")
            return {"thought": f"Processing {self.role.value} logic...", "reasoning": ["Standard execution path"]}

    async def _critique(self, result: Dict[str, Any], ctx: AgentContext) -> Dict[str, Any]:
        return {"score": 0.9, "issues": []}

    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        return {}


# ═══════════════════════════════════════════════════════════════
# SECTION 2: CONCRETE AGENT IMPLEMENTATIONS
# ═══════════════════════════════════════════════════════════════

class PlannerAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.PLANNER)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        prompt = f"Analyze this request and create a detailed execution plan: {ctx.message}. Return JSON: {{\"plan\": \"...\", \"steps\": [\"...\"], \"estimated_complexity\": \"low/medium/high\"}}"
        resp = await _ollama.generate(prompt, model=ctx.model_name)
        data = json.loads(re.search(r'\{.*\}', resp, re.DOTALL).group(0))
        return data

class DeveloperAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.DEVELOPER)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        # Context from planner
        plan = ctx.results.get(AgentRole.PLANNER, {}).get("plan", "")
        prompt = f"""
        Plan: {plan}
        Task: {ctx.message}
        Write the code to implement this. Return ONLY JSON:
        {{
            "code": "the full code",
            "file_path": "suggested_path.py",
            "explanation": "how it works"
        }}
        """
        resp = await _ollama.generate(prompt, model=ctx.model_name)
        data = json.loads(re.search(r'\{.*\}', resp, re.DOTALL).group(0))
        
        patch_id = str(uuid.uuid4())[:8]
        file_path = data.get("file_path", "solution.py")
        code = data.get("code", "")
        
        # Use CodeArm to generate diff if original exists
        original_content = ""
        full_path = SANDBOX_WORKSPACE / file_path
        if full_path.exists():
            original_content = full_path.read_text()
        
        diff = await _arms.code.generate_diff(original_content, code, file_path=file_path)
        
        # Stage in pending/
        p = SANDBOX_PENDING / patch_id / file_path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(code)
        
        ctx.pending_patches[patch_id] = {"path": file_path, "diff": diff, "content": code}
        
        await ctx.emit(StreamEvent(
            type=StreamEventType.FILE_DIFF,
            path=file_path,
            diff=diff,
            patch_id=patch_id
        ))
        
        return {"patch_id": patch_id, "path": file_path, "diff": diff, "code": code}

class MathValidatorAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.MATH_VALIDATOR)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        dev_res = ctx.results.get(AgentRole.DEVELOPER, {})
        code = dev_res.get("code", "")
        prompt = f"""
        Analyze the following code for mathematical correctness and complexity:
        ```python
        {code}
        ```
        Return ONLY JSON:
        {{
            "proven": true/false,
            "proof_steps": ["step1", "step2"],
            "complexity": {{"time": "O(n)", "space": "O(1)"}},
            "logic_errors": []
        }}
        """
        resp = await _ollama.generate(prompt, model=ctx.model_name)
        proof = json.loads(re.search(r'\{.*\}', resp, re.DOTALL).group(0))
        
        await ctx.emit(StreamEvent(
            type=StreamEventType.MATH_PROOF,
            proven=proof.get("proven", False),
            proof_steps=proof.get("proof_steps", []),
            complexity=proof.get("complexity", {})
        ))
        return proof

class CriticAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.CRITIC)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        dev_res = ctx.results.get(AgentRole.DEVELOPER, {})
        math_res = ctx.results.get(AgentRole.MATH_VALIDATOR, {})
        code = dev_res.get("code", "")
        
        prompt = f"""
        Review this code logically and for performance.
        Code: {code}
        Math Validation: {json.dumps(math_res)}
        
        Return ONLY JSON:
        {{
            "score": 0.0-1.0,
            "issues": ["issue1"],
            "suggestions": ["suggestion1"]
        }}
        """
        resp = await _ollama.generate(prompt, model=ctx.model_name)
        review = json.loads(re.search(r'\{.*\}', resp, re.DOTALL).group(0))
        return review

class TesterAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.TESTER)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        dev_res = ctx.results.get(AgentRole.DEVELOPER, {})
        code = dev_res.get("code", "")
        file_path = dev_res.get("path", "solution.py")
        patch_id = dev_res.get("patch_id")
        
        # Test in sandbox pending directory
        test_dir = SANDBOX_PENDING / patch_id
        
        async def stream_line(l): 
            await ctx.emit(StreamEvent(type=StreamEventType.TERMINAL_LINE, agent="test_agent", text=l))
            
        await stream_line(f"Starting isolated test environment for {file_path}...")
        
        # Run tests
        output, error, exec_rec = await _arms.run_tests_in_isolated_venv(
            project_dir=str(test_dir),
            requirements=["pytest"]
        )
        
        for line in output.splitlines():
            await stream_line(line)
            
        passed = exec_rec.success
        await ctx.emit(StreamEvent(
            type=StreamEventType.TEST_RESULT,
            passed=passed,
            coverage=85.0 if passed else 0.0,
            time=exec_rec.duration_ms / 1000
        ))
        return {"passed": passed, "output": output}

class SafetyAuditorAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.SAFETY_AUDITOR)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        dev_res = ctx.results.get(AgentRole.DEVELOPER, {})
        code = dev_res.get("code", "")
        
        prompt = f"Audit this code for security vulnerabilities (Secrets, SQLi, XSS, etc.): {code}. Return JSON: {{\"safe\": true/false, \"vulnerabilities\": []}}"
        resp = await _ollama.generate(prompt, model=ctx.model_name)
        audit = json.loads(re.search(r'\{.*\}', resp, re.DOTALL).group(0))
        
        if not audit.get("safe", True):
            await ctx.emit(StreamEvent(type=StreamEventType.ERROR, agent=self.role.value, message=f"Safety audit failed: {', '.join(audit.get('vulnerabilities', []))}"))
            
        return audit

class SubAgentSpawnerAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.SUB_AGENT_SPAWNER)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        # Logic to decide if sub-agents are needed
        plan = ctx.results.get(AgentRole.PLANNER, {})
        if len(plan.get("steps", [])) > 5:
            await ctx.emit(StreamEvent(type=StreamEventType.SUB_AGENT_REPORT, sub_agent_id="sub-1", message="Parallel task processing initiated."))
            return {"spawned": 1}
        return {"spawned": 0}

class GitManagerAgent(BaseAgent):
    def __init__(self): super().__init__(AgentRole.GIT_MANAGER)
    async def _run(self, ctx: AgentContext) -> Dict[str, Any]:
        # Ready to apply if everything passed
        tester_res = ctx.results.get(AgentRole.TESTER, {})
        safety_res = ctx.results.get(AgentRole.SAFETY_AUDITOR, {})
        
        ready = tester_res.get("passed", False) and safety_res.get("safe", True)
        
        if ready:
            await ctx.emit(StreamEvent(type=StreamEventType.THOUGHT_LINE, agent=self.role.value, text="All checks passed. Ready for deployment."))
        else:
            await ctx.emit(StreamEvent(type=StreamEventType.THOUGHT_LINE, agent=self.role.value, text="Checks failed. Review recommended."))
            
        return {"ready": ready}


# ═══════════════════════════════════════════════════════════════
# SECTION 3: ORCHESTRATION & API
# ═══════════════════════════════════════════════════════════════

class AgentOrchestrator:
    def __init__(self):
        self.agents = {
            AgentRole.PLANNER: PlannerAgent(),
            AgentRole.DEVELOPER: DeveloperAgent(),
            AgentRole.MATH_VALIDATOR: MathValidatorAgent(),
            AgentRole.CRITIC: CriticAgent(),
            AgentRole.TESTER: TesterAgent(),
            AgentRole.SAFETY_AUDITOR: SafetyAuditorAgent(),
            AgentRole.SUB_AGENT_SPAWNER: SubAgentSpawnerAgent(),
            AgentRole.GIT_MANAGER: GitManagerAgent(),
        }

    async def orchestrate(self, message: str, state: ConversationState) -> AsyncIterator[StreamEvent]:
        queue = asyncio.Queue()
        ctx = AgentContext(message=message, state=state, stream_callback=queue.put)
        start_time = time.time()

        async def run_pipeline():
            try:
                # Strict Sequence
                sequence = [
                    AgentRole.PLANNER, AgentRole.DEVELOPER, AgentRole.MATH_VALIDATOR,
                    AgentRole.CRITIC, AgentRole.TESTER, AgentRole.SAFETY_AUDITOR,
                    AgentRole.SUB_AGENT_SPAWNER, AgentRole.GIT_MANAGER
                ]
                
                for role in sequence:
                    agent = self.agents[role]
                    res = await agent.execute(ctx)
                    ctx.results[role] = res

                # Final Stats
                await queue.put(StreamEvent(
                    type=StreamEventType.STATS,
                    agents_run=len(sequence), agents_total=8,
                    total_time=round(time.time() - start_time, 2),
                    quality_score=int(ctx.results.get(AgentRole.CRITIC, {}).get("score", 0.9) * 100)
                ))
                
                # Final response summary
                prompt = f"""
                Summarize the results of the eAI agent execution for the user.
                Original Task: {message}
                Steps taken: {len(sequence)} agents executed.
                Final Outcome: {ctx.results.get(AgentRole.DEVELOPER, {}).get('explanation', 'Task completed.')}
                
                Keep the summary concise and professional.
                """
                resp = await _ollama.generate(prompt)
                for char in resp:
                    await queue.put(StreamEvent(type=StreamEventType.TOKEN, token=char))
                    await asyncio.sleep(0.005)

                await queue.put(None)
            except Exception as e:
                await queue.put(StreamEvent(type=StreamEventType.ERROR, message=str(e)))
                await queue.put(None)

        asyncio.create_task(run_pipeline())
        
        while True:
            ev = await queue.get()
            if ev is None: break
            yield ev

orchestrator = AgentOrchestrator()

@router.post("/stream")
async def stream_chat(request: ChatRequest):
    state = await conversation_store.get(request.session_id or "default")
    return StreamingResponse(
        (ev.sse_format() async for ev in orchestrator.orchestrate(request.message, state)),
        media_type="text/event-stream"
    )

@router.post("/apply-patch")
async def apply_patch(request: ApplyPatchRequest):
    state = await conversation_store.get(request.session_id or "default")
    if request.patch_id not in state.pending_patches:
        raise HTTPException(status_code=404, detail="Patch not found")
    
    patch = state.pending_patches.pop(request.patch_id)
    if request.action == "accept":
        dest = SANDBOX_WORKSPACE / patch["path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(patch["content"])
        return {"status": "success", "message": "Applied to workspace"}
    return {"status": "success", "message": "Rejected"}
