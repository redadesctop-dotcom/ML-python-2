import nats
from nats.js import JetStreamContext

class NATSConfig:
    """JetStream setup, persistent messaging, consumer groups."""
    
    def __init__(self, servers: list = ["nats://localhost:4222"]):
        self.servers = servers
        self.nc = None
        self.js = None

    async def connect(self):
        self.nc = await nats.connect(servers=self.servers)
        self.js = self.nc.jetstream()

    async def create_stream(self, name: str, subjects: list):
        await self.js.add_stream(name=name, subjects=subjects)

    async def publish(self, subject: str, data: bytes):
        await self.js.publish(subject, data)

    async def close(self):
        if self.nc:
            await self.nc.close()
