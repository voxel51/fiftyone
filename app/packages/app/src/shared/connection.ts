import { isElectron } from "@fiftyone/utilities";
import { v4 as uuid } from "uuid";

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

export const http = "https://dev.fiftyone.ai:5151";

export const appContext = isElectron()
  ? "desktop"
  : isColab
  ? "colab"
  : isNotebook
  ? "notebook"
  : "browser";

export default {};
