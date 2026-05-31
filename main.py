import os
import sys
import logging
import psutil
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# Add project root and backend to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)
sys.path.append(os.path.join(project_root, "backend"))

# eAI Imports
from backend.core.eai.eai_orchestrator import eAIOrchestrator
from backend.core.eai.eai_dashboard import get_eai_status
from backend.routers.mesh_api import router as mesh_router
from backend.routers.chat_api import router as chat_router
from backend.routers.system_api import router as system_router
from backend.routers.build_api import router as build_router

# Production Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}'
)
logger = logging.getLogger("backend_sidecar")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the eAI Orchestrator
    orchestrator = eAIOrchestrator() 
    orchestrator.start_eai_lifecycle() 
    print("[+] eAI Lifecycle running") 
    yield
    # Shutdown: Stop the eAI Orchestrator
    orchestrator.stop_eai_lifecycle()
    print("[+] eAI Lifecycle stopped")

app = FastAPI(
    title="eAI Agentic IDE Backend",
    description="Unified Orchestrator for local Ollama and Agentic Workflows",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Modular Routers
app.include_router(system_router)
app.include_router(chat_router)
app.include_router(build_router)
app.include_router(mesh_router)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    logger.info("WebSocket connected")
    try:
        import asyncio
        while True:
            metrics = {
                "cpu": psutil.cpu_percent(interval=None),
                "ram": psutil.virtual_memory().percent,
                "eai_status": get_eai_status(),
                "timestamp": asyncio.get_event_loop().time()
            }
            await websocket.send_json(metrics)
            await asyncio.sleep(2)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass
        logger.info("WebSocket closed")

if __name__ == "__main__":
    import uvicorn
    import sys
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    uvicorn.run(app, host="0.0.0.0", port=port)
# ✅ END OF main.py
