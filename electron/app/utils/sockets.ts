const sockets = {};

export function getSocket(port: number): WebSocket {
  if (!sockets[port]) {
    sockets[port] = new WebSocket(`ws://localhost:${port}/state`);
  }
  return sockets[port];
}

export function resetSocket(port: number): void {
  sockets[port] = new WebSocket(`ws://localhost:${port}/state`);
}
