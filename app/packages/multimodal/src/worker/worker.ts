import type { MainToWorkerMessage } from "./protocol/messages";

// TODO: implement the dedicated worker entrypoint.

self.onmessage = (_event: MessageEvent<MainToWorkerMessage>) => {
  throw new Error("Not implemented");
};

export {};
