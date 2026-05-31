import subprocess
import logging
from typing import Dict, Any

logger = logging.getLogger("tools.powershell")

async def run_powershell(command: str, timeout: int = 30) -> Dict[str, Any]:
    """Execute PowerShell commands in a sandboxed-like manner with timeout."""
    # Strict allowlist/blocklist would be here in a real production env
    blocked_keywords = ["rm -rf", "format", "del /s", "drop database"]
    if any(k in command.lower() for k in blocked_keywords):
        return {"status": "error", "message": "Command contains blocked keywords"}

    try:
        process = subprocess.run(
            ["powershell", "-Command", command],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return {
            "status": "success" if process.returncode == 0 else "error",
            "stdout": process.stdout,
            "stderr": process.stderr,
            "exit_code": process.returncode
        }
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "Command timed out"}
    except Exception as e:
        logger.error(f"PowerShell execution failed: {e}")
        return {"status": "error", "message": str(e)}
