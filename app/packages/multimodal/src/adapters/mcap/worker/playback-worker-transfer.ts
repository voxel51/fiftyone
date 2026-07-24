import type {
  McapDecodedMessage,
  McapNumericSeriesResult,
  McapSynchronizedMessageWindow,
} from "../contracts/index";

/**
 * Collects transferable buffers from decoded MCAP results before worker posting.
 */
export function transferablesForMcapResult(result: unknown): Transferable[] {
  const transferables = new Set<Transferable>();

  for (const buffer of numericSeriesBuffersFromResult(result)) {
    transferables.add(buffer);
  }
  for (const buffer of pointCloudChannelBuffersFromResult(result)) {
    transferables.add(buffer);
  }

  for (const message of decodedMessagesFromResult(result)) {
    for (const transferable of message.decoded.output.resourceHints
      ?.transferables ?? []) {
      transferables.add(transferable);
    }
  }

  return [...transferables];
}

function pointCloudChannelBuffersFromResult(result: unknown): ArrayBuffer[] {
  const record = recordFromUnknown(result);
  if (record?.kind === "rgb" && record.colors instanceof Float32Array) {
    return record.colors.buffer instanceof ArrayBuffer
      ? [record.colors.buffer]
      : [];
  }
  const scalarField = recordFromUnknown(record?.scalarField);
  if (
    record?.kind === "scalar" &&
    scalarField?.values instanceof Float32Array &&
    scalarField.values.buffer instanceof ArrayBuffer
  ) {
    return [scalarField.values.buffer];
  }
  return [];
}

function numericSeriesBuffersFromResult(result: unknown): ArrayBuffer[] {
  if (!isNumericSeriesResult(result)) {
    return [];
  }

  // Fields may share one underlying buffer (pass-through decimation
  // returns subarray views); the caller's Set dedupes.
  return result.fields.flatMap((field) => {
    const buffers: ArrayBuffer[] = [];
    if (field.timesSec.buffer instanceof ArrayBuffer) {
      buffers.push(field.timesSec.buffer);
    }
    if (field.values.buffer instanceof ArrayBuffer) {
      buffers.push(field.values.buffer);
    }
    return buffers;
  });
}

function isNumericSeriesResult(
  value: unknown,
): value is McapNumericSeriesResult {
  const record = recordFromUnknown(value);
  if (!record || !Array.isArray(record.fields)) {
    return false;
  }

  return record.fields.every((field) => {
    const fieldRecord = recordFromUnknown(field);
    return (
      !!fieldRecord &&
      fieldRecord.timesSec instanceof Float64Array &&
      fieldRecord.values instanceof Float64Array
    );
  });
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
