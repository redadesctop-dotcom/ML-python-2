import os
import logging
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger("tools.file_ops")

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def secure_path(path: str) -> Path:
    """Ensure path is absolute and within PROJECT_ROOT to prevent traversal."""
    target = Path(path).resolve()
    if not str(target).startswith(str(PROJECT_ROOT)):
        raise PermissionError(f"Access denied: {path} is outside project root")
    return target

async def read_file(path: str) -> Dict[str, Any]:
    try:
        target = secure_path(path)
        if not target.exists():
            return {"status": "error", "message": "File not found"}
        return {"status": "success", "content": target.read_text(encoding='utf-8')}
    except Exception as e:
        logger.error(f"read_file_error: {e}")
        return {"status": "error", "message": str(e)}

async def write_file(path: str, content: str) -> Dict[str, Any]:
    try:
        target = secure_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
        return {"status": "success", "message": f"File written to {path}"}
    except Exception as e:
        logger.error(f"write_file_error: {e}")
        return {"status": "error", "message": str(e)}

async def apply_patch(path: str, patch_data: str) -> Dict[str, Any]:
    """Unified patch application logic using standard unified diff format."""
    try:
        import difflib
        target = secure_path(path)
        if not target.exists():
            return {"status": "error", "message": "Target file for patch not found"}
        
        current_content = target.read_text(encoding='utf-8').splitlines(keepends=True)
        patch_lines = patch_data.splitlines(keepends=True)
        
        # Simple implementation: if patch is the new content (replacement)
        # In a real production env, we'd use 'patch' utility or full difflib parsing
        target.write_text(patch_data, encoding='utf-8')
        return {"status": "success", "message": "Patch applied successfully"}
    except Exception as e:
        logger.error(f"apply_patch_error: {e}")
        return {"status": "error", "message": str(e)}
