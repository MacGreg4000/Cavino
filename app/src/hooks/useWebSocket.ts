import { useEffect, useRef } from 'react';
import { useWineStore } from '../stores/wine';
import { useToast } from '../components/ui/Toast';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addPendingFromWs = useWineStore((s) => s.addPendingFromWs);
  const { toast } = useToast();
  const attemptsRef = useRef(0);

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'WINE_PENDING') {
            addPendingFromWs(data.wine);
            toast('info', `Nouvelle bouteille : ${data.wine.name}`);
          } else if (data.type === 'IMPORT_ERROR') {
            toast('error', `Erreur import : ${data.error}`);
          }
        } catch {}
      };

      ws.onclose = () => {
        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
        attemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [addPendingFromWs, toast]);
}
