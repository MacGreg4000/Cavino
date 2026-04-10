import { useEffect, useRef } from 'react';
import { useWineStore } from '../stores/wine';
import { useToast } from '../components/ui/Toast';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addPendingFromWs = useWineStore((s) => s.addPendingFromWs);
  const setScanResult = useWineStore((s) => s.setScanResult);
  const addScanProgress = useWineStore((s) => s.addScanProgress);
  const setActiveScanError = useWineStore((s) => s.setActiveScanError);
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
          } else if (data.type === 'IMPORT_ERROR') {
            setScanResult({ status: 'error', message: data.error || 'Erreur inconnue' });
            setActiveScanError();
            toast('error', `Erreur d'analyse : ${data.error}`);
          } else if (data.type === 'SCAN_PROGRESS') {
            addScanProgress(data.scanId, {
              ts: data.ts,
              stage: data.stage,
              message: data.message,
              level: data.level ?? 'info',
            });
          }
        } catch {}
      };

      ws.onclose = () => {
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
  }, [addPendingFromWs, setScanResult, addScanProgress, setActiveScanError, toast]);
}
