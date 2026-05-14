import { VISUALIZATION_KIND } from "../../visualization";
import type {
  McapDecodedMessage,
  McapSynchronizedMessageWindow,
} from "../types";

/**
 * Collects transferable buffers from decoded MCAP results before worker posting.
 */
export function transferablesForMcapResult(result: unknown): Transferable[] {
  const transferables = new Set<ArrayBuffer>();

  for (const message of decodedMessagesFromResult(result)) {
    const visualization = message.decoded.output.visualization;
    if (!visualization) {
      continue;
    }

    if (visualization.kind === VISUALIZATION_KIND.ENCODED_IMAGE) {
      addTransferableBuffer(transferables, visualization.bytes);
    } else if (visualization.kind === VISUALIZATION_KIND.POINT_CLOUD) {
      addTransferableBuffer(transferables, visualization.positions);
    }
  }

  return [...transferables];
}

function decodedMessagesFromResult(
  result: unknown
): readonly McapDecodedMessage[] {
  if (isSynchronizedWindow(result)) {
    return result.messages;
  }

  if (Array.isArray(result)) {
    return result.flatMap((item) =>
      isSynchronizedWindow(item)
        ? item.messages
        : isDecodedMessage(item)
        ? [item]
        : []
    );
  }

  return isDecodedMessage(result) ? [result] : [];
}

function isSynchronizedWindow(
  value: unknown
): value is McapSynchronizedMessageWindow {
  return (
    !!value &&
    typeof value === "object" &&
    "messages" in value &&
    Array.isArray(value.messages)
  );
}

function isDecodedMessage(value: unknown): value is McapDecodedMessage {
  return !!value && typeof value === "object" && "decoded" in value;
}

function addTransferableBuffer(
  transferables: Set<ArrayBuffer>,
  view: ArrayBufferView
) {
  if (view.buffer instanceof ArrayBuffer) {
    transferables.add(view.buffer);
  }
}
