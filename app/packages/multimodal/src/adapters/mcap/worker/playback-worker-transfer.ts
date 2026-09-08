import type {
  McapDecodedMessage,
  McapNumericSeriesResult,
  McapNumericSeriesSliceResult,
} from "../contracts/index";
import { messagesFromMcapWorkerResult } from "./worker-result-traversal";

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

  for (const message of messagesFromMcapWorkerResult(
    result,
    isDecodedMessage,
  )) {
    for (const transferable of message.decoded.output.resourceHints
      ?.transferables ?? []) {
      transferables.add(transferable);
    }
  }

  return [...transferables];
}

function pointCloudChannelBuffersFromResult(result: unknown): ArrayBuffer[] {
  const record = recordFromUnknown(result);
  const rgb = recordFromUnknown(record?.rgb);
  if (record?.kind === "rgb" && rgb && ArrayBuffer.isView(rgb.values)) {
    return rgb.values.buffer instanceof ArrayBuffer ? [rgb.values.buffer] : [];
  }
  const scalarField = recordFromUnknown(record?.scalarField);
  if (
    record?.kind === "scalar" &&
    scalarField &&
    ArrayBuffer.isView(scalarField.values) &&
    scalarField.values.buffer instanceof ArrayBuffer
  ) {
    return [scalarField.values.buffer];
  }
  return [];
}

function numericSeriesBuffersFromResult(result: unknown): ArrayBuffer[] {
  const fields = isNumericSeriesResult(result)
    ? result.fields
    : isNumericSeriesSliceResult(result)
      ? result.series.flatMap((series) => series.fields)
      : null;
  if (!fields) {
    return [];
  }

  // Fields may share one underlying buffer (pass-through decimation
  // returns subarray views); the caller's Set dedupes.
  return fields.flatMap((field) => {
    const buffers: ArrayBuffer[] = [];
    if (field.bucketGapMask?.buffer instanceof ArrayBuffer) {
      buffers.push(field.bucketGapMask.buffer);
    }
    if (field.timesSec.buffer instanceof ArrayBuffer) {
      buffers.push(field.timesSec.buffer);
    }
    if (field.values.buffer instanceof ArrayBuffer) {
      buffers.push(field.values.buffer);
    }
    return buffers;
  });
}

function isNumericSeriesSliceResult(
  value: unknown,
): value is McapNumericSeriesSliceResult {
  const record = recordFromUnknown(value);
  if (!record || !Array.isArray(record.series)) {
    return false;
  }
  return record.series.every((series) => {
    const seriesRecord = recordFromUnknown(series);
    return (
      !!seriesRecord &&
      Array.isArray(seriesRecord.fields) &&
      seriesRecord.fields.every((field) => {
        const fieldRecord = recordFromUnknown(field);
        return (
          !!fieldRecord &&
          fieldRecord.timesSec instanceof Float64Array &&
          fieldRecord.values instanceof Float64Array
        );
      })
    );
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
