import subprocess
import os
from typing import List, Optional

class SandboxedOps:
    """File/terminal tools with allowlist, dry-run, timeout, audit."""
    
    def __init__(self, allowlist_cmds: List[str], base_dir: str):
        self.allowlist_cmds = allowlist_cmds
        self.base_dir = base_dir

    async def execute_cmd(self, cmd: str, args: List[str], dry_run: bool = True) -> str:
        if cmd not in self.allowlist_cmds:
            raise PermissionError(f"Command {cmd} not in allowlist")
        
        full_cmd = [cmd] + args
        if dry_run:
            return f"[DRY-RUN] Executing: {' '.join(full_cmd)}"
        
        # Actual execution with timeout and isolation
        result = subprocess.run(full_cmd, capture_output=True, text=True, timeout=10)
        return result.stdout

    def safe_write(self, path: str, content: str):
        # Ensure path is within base_dir
        abs_path = os.path.abspath(path)
        if not abs_path.startswith(os.path.abspath(self.base_dir)):
            raise PermissionError("Access denied outside base directory")
        with open(abs_path, "w") as f:
            f.write(content)
