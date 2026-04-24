import type {
  MainToWorkerMessage,
  WorkerMessageCandidate,
  WorkerPayload,
  WorkerToMainMessage,
} from "./protocol/messages";
import { WORKER_MESSAGE_TYPE } from "./protocol/messages";

// TODO: implement the dedicated worker entrypoint.

function isWorkerPayload(
  message: WorkerMessageCandidate
): message is WorkerPayload {
  return (
    typeof message === "object" &&
    message !== null &&
    !Array.isArray(message) &&
    !(message instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(message)
  );
}

function isWorkerMessage(
  message: WorkerMessageCandidate
): message is MainToWorkerMessage {
  return isWorkerPayload(message) && typeof message.type === "string";
}

function postToMain(message: WorkerToMainMessage): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<WorkerMessageCandidate>): void => {
  if (!isWorkerMessage(event.data)) {
    postToMain({
      type: WORKER_MESSAGE_TYPE.ERROR,
      payload: { message: "Invalid worker message" },
    });
    return;
  }

  postToMain({
    type: WORKER_MESSAGE_TYPE.UNHANDLED,
    payload: { type: event.data.type },
  });
};

export {};
