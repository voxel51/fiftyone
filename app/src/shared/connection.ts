import ReconnectingWebSocket from "reconnecting-websocket";
import uuid from "uuid-v4";

import { isElectron } from "../utils/generic";

class HTTPSSocket {
  location: string;
  events: {
    [name: string]: Set<(data: object) => void>;
  } = {};
  readyState: number = WebSocket.CONNECTING;
  openTimeout: number = 2000;
  timeout: number = 2000;
  interval: ReturnType<typeof setTimeout>;

  constructor(location: string) {
    this.location = location;
    this.connect();
  }

  connect() {
    this.gather();
    this.interval = setInterval(() => this.gather(), this.timeout);
  }

  execute(messages) {
    if ([WebSocket.CLOSED, WebSocket.CONNECTING].includes(this.readyState)) {
      this.events.open.forEach((h) => h(null));
      this.timeout = this.openTimeout;
      clearInterval(this.interval);
      this.interval = setInterval(() => this.gather(), this.timeout);
    }
    this.readyState = WebSocket.OPEN;
    messages.forEach((m) => {
      fetch(this.location + "&mode=pull", {
        method: "post",
        body: JSON.stringify(m),
      })
        .then((response) => response.json())
        .then((data) => {
          this.events.message.forEach((h) => h({ data: JSON.stringify(data) }));
        });
    });
  }

  gather() {
    fetch(this.location)
      .then((response) => response.json())
      .then(({ messages }) => this.execute(messages))
      .catch(() => {
        if (this.readyState === WebSocket.OPEN && this.events.close) {
          this.events.close.forEach((h) => h(null));
        }
        this.readyState = WebSocket.CLOSED;
        clearInterval(this.interval);
        this.timeout = Math.min(this.timeout * 2, 5000);
        this.interval = setInterval(() => this.gather(), this.timeout);
      });
  }

  addEventListener(eventType, handler) {
    if (!this.events[eventType]) {
      this.events[eventType] = new Set();
    }
    this.events[eventType].add(handler);
  }

  removeEventListener(eventType, handler) {
    this.events[eventType].delete(handler);
  }

  send(message) {
    fetch(this.location + "&mode=push", {
      method: "post",
      body: message,
    })
      .then((response) => response.json())
      .then((data) => {
        const { messages, type } = data;
        messages && this.execute(messages);
        type &&
          this.events.message.forEach((h) => h({ data: JSON.stringify(data) }));
      });
  }
}

export const isNotebook = new URLSearchParams(window.location.search).get(
  "notebook"
);

export const isColab = new URLSearchParams(window.location.search).get(
  "fiftyoneColab"
);

export const handleId = new URLSearchParams(window.location.search).get(
  "handleId"
);

export const sessionId = uuid();

const host =
  process.env.NODE_ENV === "development"
    ? "localhost:5151"
    : window.location.host;

export const port = isElectron()
  ? parseInt(process.env.FIFTYONE_SERVER_PORT) || 5151
  : parseInt(window.location.port);

export const http = isElectron()
  ? `http://localhost:${port}`
  : window.location.protocol + "//" + host;

export const ws = isElectron()
  ? `ws://localhost:${port}/state`
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${host}/state`;

export const appContext = isElectron()
  ? "desktop"
  : isColab
  ? "colab"
  : isNotebook
  ? "notebook"
  : "browser";

export default isColab
  ? new HTTPSSocket(`${http}/polling?sessionId=${sessionId}`)
  : new ReconnectingWebSocket(ws);
