import type { WebSocket } from 'ws';

const clients = new Set<WebSocket>();

// Lazily imported to avoid circular dep (watcher imports broadcast from here)
let _replayFn: ((ws: WebSocket) => Promise<void>) | null = null;
export function setReplayFn(fn: (ws: WebSocket) => Promise<void>) {
  _replayFn = fn;
}

export function addClient(ws: WebSocket) {
  clients.add(ws);
  console.log(`🔌 WS client connecté (total: ${clients.size})`);

  // Catch up new/reconnected client with latest scan progress
  if (_replayFn) _replayFn(ws).catch(() => {});

  // Pong handler — réponse aux pings du client
  ws.on('pong', () => {});
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`🔌 WS client déconnecté (total: ${clients.size})`);
  });
}

export function broadcast(data: unknown) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  }
}

// Ping toutes les 25s pour maintenir la connexion à travers nginx + routeurs NAT
setInterval(() => {
  for (const client of clients) {
    if (client.readyState === 1) {
      client.ping();
    } else if (client.readyState !== 0) { // pas CONNECTING
      clients.delete(client);
    }
  }
}, 25_000);
