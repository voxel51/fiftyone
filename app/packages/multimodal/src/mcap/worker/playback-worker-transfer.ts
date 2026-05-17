import type {
  McapDecodedMessage,
  McapSynchronizedMessageWindow,
} from "../types";

/**
 * Collects transferable buffers from decoded MCAP results before worker posting.
 */
export function transferablesForMcapResult(result: unknown): Transferable[] {
  const transferables = new Set<Transferable>();

  for (const message of decodedMessagesFromResult(result)) {
    for (const transferable of message.decoded.output.resourceHints
      ?.transferables ?? []) {
      transferables.add(transferable);
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
