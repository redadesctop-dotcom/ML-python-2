class MultiRegionSetup:
    """Active-Passive setup, geo-DNS, state replication, failover logic."""
    
    def __init__(self, regions: list = ["us-east-1", "eu-west-1"]):
        self.regions = regions
        self.active_region = regions[0]

    def trigger_failover(self):
        self.active_region = self.regions[1] if self.active_region == self.regions[0] else self.regions[0]
        print(f"FAILOVER: Active region switched to {self.active_region}")

    def replicate_state(self, state: dict):
        """Sync state across regions."""
        # Logic for cross-region DB/Cache replication
        pass
