import { useState, useEffect } from 'react';

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
}

interface UseApiHealthReturn {
  isHealthy: boolean;
  isLoading: boolean;
  error: string | null;
  data: HealthResponse | null;
  refetch: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3467';

/**
 * Custom hook to check API health status
 * Calls GET /health from the backend and logs the result
 */
export const useApiHealth = (): UseApiHealthReturn => {
  const [isHealthy, setIsHealthy] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [refetchCounter, setRefetchCounter] = useState(0);

  const refetch = () => {
    setRefetchCounter(prev => prev + 1);
  };

  useEffect(() => {
    const checkHealth = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log('🏥 Checking API health...');
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}`);
        }

        const healthData: HealthResponse = await response.json();
        
        console.log('✅ API Health Check Result:', {
          status: healthData.status,
          environment: healthData.environment,
          uptime: healthData.uptime,
          timestamp: healthData.timestamp,
        });

        setData(healthData);
        setIsHealthy(healthData.status === 'ok');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('❌ API Health Check Failed:', errorMessage);
        setError(errorMessage);
        setIsHealthy(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkHealth();
  }, [refetchCounter]);

  return {
    isHealthy,
    isLoading,
    error,
    data,
    refetch,
  };
};

export default useApiHealth;
