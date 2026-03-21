import { useEffect, useRef, useState } from 'react';

interface PaymentStatusEvent {
  type: 'payment.status.changed';
  paymentId: string;
  fromStatus: string;
  toStatus: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface UsePaymentStreamOptions {
  onStatusChange?: (event: PaymentStatusEvent) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

/**
 * Custom hook to subscribe to real-time payment status updates via SSE
 * 
 * @param paymentId - The payment ID to subscribe to
 * @param options - Configuration options
 * @returns Object with connection state and control methods
 */
export const usePaymentStream = (
  paymentId: string | null,
  options: UsePaymentStreamOptions = {}
) => {
  const {
    onStatusChange,
    onError,
    onConnect,
    onDisconnect,
    autoReconnect = true,
    reconnectDelay = 3000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [latestStatus, setLatestStatus] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(autoReconnect);

  const connect = () => {
    if (!paymentId) {
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const streamUrl = `${apiUrl}/payments/${paymentId}/stream`;

    try {
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        onConnect?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data: PaymentStatusEvent = JSON.parse(event.data);
          
          setLatestStatus(data.toStatus);
          onStatusChange?.(data);

          // Auto-close on final status
          if (
            data.toStatus === 'succeeded' ||
            data.toStatus === 'failed' ||
            data.toStatus === 'refunded'
          ) {
            eventSource.close();
            setIsConnected(false);
            shouldReconnectRef.current = false;
          }
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError);
        }
      };

      eventSource.onerror = (err) => {
        const errorObj = new Error('SSE connection error');
        setError(errorObj);
        setIsConnected(false);
        onError?.(errorObj);

        eventSource.close();

        // Auto-reconnect if enabled
        if (shouldReconnectRef.current && autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to create SSE connection');
      setError(errorObj);
      onError?.(errorObj);
    }
  };

  const disconnect = () => {
    shouldReconnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      onDisconnect?.();
    }
  };

  useEffect(() => {
    if (paymentId) {
      shouldReconnectRef.current = autoReconnect;
      connect();
    }

    return () => {
      disconnect();
    };
  }, [paymentId]);

  return {
    isConnected,
    latestStatus,
    error,
    connect,
    disconnect,
  };
};
