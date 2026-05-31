"""Backend package initialization."""

__version__ = "1.0.0"
__author__ = "ML-Python Team"

# Import core modules
from . import api
from . import core
from . import config
from . import memory

__all__ = [
    "api",
    "core",
    "config",
    "memory",
]
