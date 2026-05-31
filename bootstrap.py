import os
import sys
import json
import socket
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("bootstrap")

REQUIRED_PACKAGES = [
    "fastapi", "uvicorn", "langgraph", "pydantic", 
    "websockets", "openai", "pandas", "faiss-cpu", 
    "numpy", "python-dotenv"
]

RUNTIME_STATUS_PATH = Path(__file__).parent / "runtime_status.json"

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def check_dependencies():
    logger.info("Checking dependencies...")
    missing = []
    for pkg in REQUIRED_PACKAGES:
        try:
            __import__(pkg.replace("-", "_"))
        except ImportError:
            missing.append(pkg)
    
    if missing:
        logger.warning(f"Missing packages: {missing}. Attempting installation...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
            logger.info("Dependencies installed successfully.")
        except Exception as e:
            logger.error(f"Failed to install dependencies: {e}")
            return False
    return True

def bootstrap():
    status = {
        "pid": os.getpid(),
        "port": 8000,
        "status": "initializing",
        "last_error": None
    }

    # 1. Check Python Version
    if sys.version_info < (3, 10):
        status["status"] = "failed"
        status["last_error"] = "Python 3.10+ required"
        write_status(status)
        logger.error(status["last_error"])
        sys.exit(1)

    # 2. Check Dependencies
    if not check_dependencies():
        status["status"] = "failed"
        status["last_error"] = "Dependency installation failed"
        write_status(status)
        sys.exit(1)

    # 3. Port Management
    port = 8000
    while is_port_in_use(port):
        logger.warning(f"Port {port} in use, trying {port + 1}")
        port += 1
        if port > 8010:
            status["status"] = "failed"
            status["last_error"] = "No available ports in range 8000-8010"
            write_status(status)
            logger.error(status["last_error"])
            sys.exit(1)
    
    status["port"] = port
    status["status"] = "ready"
    write_status(status)
    logger.info(f"Bootstrap complete. Ready on port {port}")
    return port

def write_status(status):
    with open(RUNTIME_STATUS_PATH, "w") as f:
        json.dump(status, f, indent=2)

if __name__ == "__main__":
    port = bootstrap()
    # Start the actual FastAPI app
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="info")
