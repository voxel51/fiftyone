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
  result: unknown,
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
          : [],
    );
  }

  return isDecodedMessage(result) ? [result] : [];
}

function isSynchronizedWindow(
  value: unknown,
): value is McapSynchronizedMessageWindow {
  return Array.isArray(recordFromUnknown(value)?.messages);
}

function isDecodedMessage(value: unknown): value is McapDecodedMessage {
  const decoded = recordFromUnknown(value)?.decoded;
  const output = recordFromUnknown(decoded)?.output;
  const outputRecord = recordFromUnknown(output);
  if (!outputRecord) {
    return false;
  }

  return hasTransferableResourceHints(outputRecord.resourceHints);
}

function hasTransferableResourceHints(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  // Decoder hints are the one bit of this response shape we dereference before
  // structured cloning, so validate only that narrow path.
  const resourceHints = recordFromUnknown(value);
  return (
    !!resourceHints &&
    (resourceHints.transferables === undefined ||
      Array.isArray(resourceHints.transferables))
  );
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}
