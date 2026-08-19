import {
  getFetchFunctionExtended,
  type FetchFunctionConfig,
  type FetchFunctionResult,
} from "@fiftyone/utilities";
import { createAbortError } from "../../utils/cancellation";
import { safeNumber } from "./bigint-utils";
import { parseByteSize } from "./byte-size";
import type { ByteClient } from "./types";

const DEFAULT_HTTP_BYTE_READ_RETRIES = 2;
const DEFAULT_HTTP_BYTE_READ_INACTIVITY_TIMEOUT_MS = 30_000;
const MAX_HTTP_BYTE_READ_INACTIVITY_TIMEOUT_MS = 5 * 60_000;
const MIN_HTTP_BYTE_READ_RATE_BYTES_PER_SEC = 64 * 1024;
const HTTP_BYTE_READ_ABORT_MESSAGE = "HTTP byte-range read aborted";

type AbortableFetchFunction = <Body, Result>(
  config: FetchFunctionConfig<Body>,
) => Promise<FetchFunctionResult<Result>>;

/**
 * Creates an HTTP byte reader that sends explicit Range headers.
 */
export function createHttpByteClient(
  fetchFunction?: AbortableFetchFunction,
): ByteClient {
  return {
    async stat(source) {
      const fetchBytes: AbortableFetchFunction =
        fetchFunction ?? getFetchFunctionExtended();
      const controller = new AbortController();

      try {
        const { headers } = await withHttpByteReadTimeout(
          (onProgress) =>
            fetchBytes<undefined, ArrayBuffer>({
              method: "HEAD",
              path: source.url,
              result: "arrayBuffer",
              retries: DEFAULT_HTTP_BYTE_READ_RETRIES,
              signal: controller.signal,
              onProgress,
            }),
          controller,
          DEFAULT_HTTP_BYTE_READ_INACTIVITY_TIMEOUT_MS,
        );
        const sizeBytes = parseByteSize(headers?.get("Content-Length"));
        const etag = normalizeEtag(headers?.get("ETag"));

        if (sizeBytes === undefined && etag === undefined) {
          return undefined;
        }

        return {
          ...source,
          ...(etag !== undefined ? { etag } : {}),
          ...(sizeBytes !== undefined
            ? { sizeBytes: sizeBytes.toString() }
            : {}),
        };
      } catch {
        // HEAD is only an optimization; object stores and CORS policies often
        // block it even when ranged GETs are allowed.
        return undefined;
      }
    },

    async readBytes(request) {
      if (request.range.offset < 0n) {
        throw new Error("Byte range offset must be non-negative");
      }
      if (request.range.length <= 0n) {
        throw new Error("Byte range length must be positive");
      }
      if (request.signal?.aborted) {
        throw createAbortError(HTTP_BYTE_READ_ABORT_MESSAGE);
      }

      const expectedLength = safeNumber(request.range.length);
      const endOffset = request.range.offset + request.range.length - 1n;
      const fetchBytes: AbortableFetchFunction =
        fetchFunction ?? getFetchFunctionExtended();
      // Abort is best-effort; Promise.race below is the actual guarantee that
      // readBytes does not wait forever on a hung range request.
      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      request.signal?.addEventListener("abort", onExternalAbort);
      let headers: Headers | undefined;
      let buffer: ArrayBuffer;
      try {
        ({ headers, response: buffer } = await withHttpByteReadTimeout(
          (onProgress) =>
            fetchBytes<undefined, ArrayBuffer>({
              headers: {
                Range: `bytes=${request.range.offset.toString()}-${endOffset.toString()}`,
              },
              method: "GET",
              path: request.source.url,
              result: "arrayBuffer",
              retries: DEFAULT_HTTP_BYTE_READ_RETRIES,
              signal: controller.signal,
              onProgress,
            }),
          controller,
          httpByteReadInactivityTimeoutMs(expectedLength),
        ));
      } catch (error) {
        // Deliberate aborts must be distinguishable from transport failures.
        if (request.signal?.aborted) {
          throw createAbortError(HTTP_BYTE_READ_ABORT_MESSAGE);
        }
        throw error;
      } finally {
        request.signal?.removeEventListener("abort", onExternalAbort);
      }
      const bytes = new Uint8Array(buffer);

      // Validate the HTTP range contract before trusting the returned bytes.
      const contentRange = headers?.get("Content-Range");
      if (!contentRange) {
        throw new Error(
          "Expected Content-Range header for byte-range response",
        );
      }

      const contentRangeMatch = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(
        contentRange,
      );
      if (!contentRangeMatch) {
        throw new Error(`Invalid Content-Range header '${contentRange}'`);
      }

      const contentRangeStart = BigInt(contentRangeMatch[1]);
      const contentRangeEnd = BigInt(contentRangeMatch[2]);
      if (
        contentRangeStart !== request.range.offset ||
        contentRangeEnd !== request.range.offset + request.range.length - 1n ||
        safeNumber(contentRangeEnd - contentRangeStart + 1n) !== expectedLength
      ) {
        throw new Error(
          `Expected Content-Range for ${request.range.offset.toString()}-${
            request.range.offset + request.range.length - 1n
          } but received '${contentRange}'`,
        );
      }

      const totalSizeBytes =
        contentRangeMatch[3] === "*" ? undefined : BigInt(contentRangeMatch[3]);
      if (totalSizeBytes !== undefined && contentRangeEnd >= totalSizeBytes) {
        throw new Error(`Invalid Content-Range header '${contentRange}'`);
      }
      if (bytes.byteLength !== expectedLength) {
        throw new Error(
          `Expected ${expectedLength} bytes but received ${bytes.byteLength}`,
        );
      }

      // Preserve discovered source size and content validator so later cache
      // fills can align blocks and persistent caches can detect rewrites.
      let source = request.source;
      if (totalSizeBytes !== undefined) {
        const sizeBytes = totalSizeBytes.toString();
        if (source.sizeBytes !== sizeBytes) {
          source = {
            ...source,
            sizeBytes,
          };
        }
      }
      const etag = normalizeEtag(headers?.get("ETag"));
      if (etag !== undefined && source.etag !== etag) {
        source = {
          ...source,
          etag,
        };
      }

      return {
        bytes,
        range: request.range,
        source,
      };
    },
  };
}

/**
 * Strips weak-validator prefixes and quotes so object-store and proxy ETag
 * spellings of the same validator compare equal.
 */
function normalizeEtag(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().replace(/^W\//i, "");
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;

  return unquoted.length > 0 ? unquoted : undefined;
}

function withHttpByteReadTimeout<Result>(
  request: (onProgress: (loadedBytes: number) => void) => Promise<Result>,
  controller: AbortController,
  inactivityTimeoutMs: number,
): Promise<Result> {
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error(
    `HTTP byte-range read timed out after ${inactivityTimeoutMs}ms without progress`,
  );
  let rejectTimeout!: (error: Error) => void;
  const timeoutRequest = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  let lastLoadedBytes = 0;
  const armTimeout = () => {
    if (timedOut) return;
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      rejectTimeout(timeoutError);
    }, inactivityTimeoutMs);
  };
  const onProgress = (loadedBytes: number) => {
    if (loadedBytes <= lastLoadedBytes) return;
    lastLoadedBytes = loadedBytes;
    armTimeout();
  };
  armTimeout();

  return Promise.race([
    Promise.resolve().then(() => request(onProgress)),
    timeoutRequest,
  ])
    .catch((error) => {
      if (timedOut) {
        throw timeoutError;
      }

      throw error;
    })
    .finally(() => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    });
}

function httpByteReadInactivityTimeoutMs(expectedLength: number): number {
  const sizeAwareTimeoutMs = Math.ceil(
    (expectedLength / MIN_HTTP_BYTE_READ_RATE_BYTES_PER_SEC) * 1_000,
  );
  return Math.min(
    MAX_HTTP_BYTE_READ_INACTIVITY_TIMEOUT_MS,
    Math.max(DEFAULT_HTTP_BYTE_READ_INACTIVITY_TIMEOUT_MS, sizeAwareTimeoutMs),
  );
}
