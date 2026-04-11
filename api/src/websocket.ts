import type { WebSocket } from 'ws';

const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket) {
  clients.add(ws);

  // Pong handler — réponse aux pings du client
  ws.on('pong', () => {});
  ws.on('close', () => clients.delete(ws));
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
