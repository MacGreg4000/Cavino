import { useEffect, useRef } from 'react';
import { useWineStore } from '../stores/wine';
import { useToast } from '../components/ui/Toast';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addPendingFromWs = useWineStore((s) => s.addPendingFromWs);
  const markScanError = useWineStore((s) => s.markScanError);
  const markScanDuplicate = useWineStore((s) => s.markScanDuplicate);
  const addScanProgress = useWineStore((s) => s.addScanProgress);
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
            // Passe le scanId top-level (backend) ou fallback sur wine.scanId (DB row)
            addPendingFromWs(data.wine, data.scanId ?? data.wine?.scanId ?? null);
          } else if (data.type === 'IMPORT_ERROR') {
            markScanError(data.scanId);
            toast('error', `Erreur d'analyse : ${data.error}`);
          } else if (data.type === 'IMPORT_DUPLICATE') {
            // Rejet métier (doublon) : l'IA a fonctionné, la bouteille est déjà dans la cave.
            // On marque le scan en "done" sans wine plutôt qu'en "error".
            markScanDuplicate(data.scanId);
            toast('warning', `Doublon : ${data.error}`);
          } else if (data.type === 'SCAN_PROGRESS') {
            addScanProgress(data.scanId, {
              ts: data.ts,
              stage: data.stage,
              message: data.message,
              level: data.level ?? 'info',
            });
            // Le scan-service signale un échec terminal par stage='done' + level='error'.
            // Sans ça, le scan reste coincé en "analyzing" pour toujours côté front.
            if (data.stage === 'done' && data.level === 'error') {
              markScanError(data.scanId);
            }
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
  }, [addPendingFromWs, markScanError, addScanProgress, toast]);
}
