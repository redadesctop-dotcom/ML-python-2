import { useState, useEffect } from 'react';

export const useHealthCheck = (port: number = 8000) => {
    const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const response = await fetch(`http://localhost:${port}/health`);
                if (response.ok) {
                    setIsHealthy(true);
                    setError(null);
                } else {
                    throw new Error(`Sidecar returned status: ${response.status}`);
                }
            } catch (err: any) {
                if (retryCount < 10) {
                    setTimeout(() => setRetryCount(prev => prev + 1), 1000);
                } else {
                    setIsHealthy(false);
                    setError(err.message || "Failed to connect to sidecar");
                }
            }
        };

        checkHealth();
    }, [retryCount, port]);

    return { isHealthy, error, retryCount };
};
