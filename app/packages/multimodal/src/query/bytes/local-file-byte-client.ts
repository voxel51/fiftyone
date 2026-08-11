import { createAbortError, throwIfAborted } from "../../utils/cancellation";
import { safeNumber } from "./bigint-utils";
import type {
  ByteClient,
  ByteRangeReadRequest,
  ByteSourceDescriptor,
} from "./types";

const FILE_BYTE_READ_ABORT_MESSAGE = "File byte-range read aborted";

/**
 * Creates a byte client that reads sources backed by `ByteSourceDescriptor`
 * local File objects. The File can be structured-cloned to workers, unlike a
 * custom ByteClient closure.
 */
export function createLocalFileByteClient(): ByteClient {
  return {
    async stat(source) {
      return source.localFile
        ? withFileSize(source, source.localFile)
        : undefined;
    },

    async readBytes(request) {
      const file = request.source.localFile;
      if (!file) {
        throw new Error("Local file source is missing its File handle");
      }

      validateRequestRange(request, file);
      throwIfAborted(request.signal, FILE_BYTE_READ_ABORT_MESSAGE);

      const start = safeNumber(request.range.offset);
      const length = safeNumber(request.range.length);
      const bytes = new Uint8Array(
        await readBlobArrayBuffer(
          file.slice(start, start + length),
          request.signal,
        ),
      );

      if (bytes.byteLength !== length) {
        throw new Error(
          `Expected ${length} bytes but received ${bytes.byteLength}`,
        );
      }

      return {
        bytes,
        range: request.range,
        source: withFileSize(request.source, file),
      };
    },
  };
}

function validateRequestRange(request: ByteRangeReadRequest, file: File): void {
  if (request.range.offset < 0n) {
    throw new Error("Byte range offset must be non-negative");
  }
  if (request.range.length <= 0n) {
    throw new Error("Byte range length must be positive");
  }

  const end = request.range.offset + request.range.length;
  if (end > BigInt(file.size)) {
    throw new Error(
      `Byte range ${request.range.offset.toString()}-${
        end - 1n
      } exceeds file size ${file.size}`,
    );
  }
}

function withFileSize(
  source: ByteSourceDescriptor,
  file: File,
): ByteSourceDescriptor {
  const sizeBytes = String(file.size);
  return source.sizeBytes === sizeBytes ? source : { ...source, sizeBytes };
}

function readBlobArrayBuffer(
  blob: Blob,
  signal: AbortSignal | undefined,
): Promise<ArrayBuffer> {
  if (!signal) {
    return blobArrayBuffer(blob);
  }
  throwIfAborted(signal, FILE_BYTE_READ_ABORT_MESSAGE);

  return new Promise((resolve, reject) => {
    const onAbort = () =>
      reject(createAbortError(FILE_BYTE_READ_ABORT_MESSAGE));
    signal.addEventListener("abort", onAbort, { once: true });
    blobArrayBuffer(blob)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", onAbort);
      });
  });
}

function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  if (typeof FileReader === "undefined") {
    return Promise.reject(new Error("Blob arrayBuffer is not available"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file bytes"));
    };
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new Error("FileReader did not return an ArrayBuffer"));
    };
    reader.readAsArrayBuffer(blob);
  });
}
