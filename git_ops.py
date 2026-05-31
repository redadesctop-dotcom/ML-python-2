import os
import logging
import subprocess
from typing import Dict, Any, List
from pathlib import Path
from pydantic import BaseModel

logger = logging.getLogger("tools.git_ops")
PROJECT_ROOT = Path(__file__).resolve().parent.parent

class GitRequest(BaseModel):
    command: str
    args: List[str] = []

async def git_op(command: str, args: List[str] = []) -> Dict[str, Any]:
    """Execute Git commands safely within the project root."""
    allowed_commands = ["status", "log", "diff", "add", "commit", "branch"]
    if command not in allowed_commands:
        return {"status": "error", "message": f"Git command '{command}' is not allowlisted"}

    try:
        full_cmd = ["git", command] + args
        process = subprocess.run(
            full_cmd,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=15
        )
        return {
            "status": "success" if process.returncode == 0 else "error",
            "stdout": process.stdout,
            "stderr": process.stderr,
            "exit_code": process.returncode
        }
    except Exception as e:
        logger.error(f"git_op_error: {e}")
        return {"status": "error", "message": str(e)}
