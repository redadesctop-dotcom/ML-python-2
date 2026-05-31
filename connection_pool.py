import httpx
import asyncio
from typing import Dict

class ConnectionPool:
    """Async HTTP/2 pooling, request caching, backpressure handling."""
    
    def __init__(self, max_connections: int = 100):
        self.limits = httpx.Limits(max_connections=max_connections, max_keepalive_connections=20)
        self.client = httpx.AsyncClient(http2=True, limits=self.limits)
        self.cache: Dict[str, Any] = {}

    async def get(self, url: str, use_cache: bool = True):
        if use_cache and url in self.cache:
            return self.cache[url]
        
        response = await self.client.get(url)
        if use_cache:
            self.cache[url] = response.json()
        return response.json()

    async def close(self):
        await self.client.aclose()
