import { isElectron } from "@fiftyone/utilities";
import { v4 as uuid } from "uuid";

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
  ? `ws://${address}:${port}/state`
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${host}/state`;

export const appContext = isElectron()
  ? "desktop"
  : isColab
  ? "colab"
  : isDatabricks
  ? "databricks"
  : isNotebook
  ? "notebook"
  : "browser";

export default {};
