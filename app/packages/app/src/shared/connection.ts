import ReconnectingWebSocket from "reconnecting-websocket";
import { v4 as uuid } from "uuid";

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

export const polling = new URLSearchParams(window.location.search).get(
  "polling"
);

export const isColab = new URLSearchParams(window.location.search).get("colab");

export const isDatabricks = new URLSearchParams(window.location.search).get(
  "databricks"
);

export const handleId = new URLSearchParams(window.location.search).get(
  "handleId"
);

export const sessionId = uuid();

const host = import.meta.env.DEV ? "localhost:5151" : window.location.host;
const path = window.location.pathname.endsWith("/")
  ? window.location.pathname.slice(0, -1)
  : window.location.pathname;

export const port = isElectron()
  ? parseInt(process.env.FIFTYONE_SERVER_PORT) || 5151
  : parseInt(window.location.port);

const address = isElectron()
  ? process.env.FIFTYONE_SERVER_ADDRESS || "localhost"
  : window.location.hostname;

export const http = isElectron()
  ? `http://${address}:${port}`
  : window.location.protocol + "//" + host + path;

export const ws = isElectron()
  ? `ws://${address}:${port}/${path}/state`
  : `${
      window.location.protocol === "https:" ? "wss:" : "ws:"
    }//${host}${path}/state`;

export const appContext = isElectron()
  ? "desktop"
  : isColab
  ? "colab"
  : isDatabricks
  ? "databricks"
  : isNotebook
  ? "notebook"
  : "browser";

export default polling
  ? new HTTPSSocket(`${http}/polling?sessionId=${sessionId}`)
  : new ReconnectingWebSocket(ws);
