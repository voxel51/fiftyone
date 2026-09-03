import {
  getFetchFunctionExtended,
  type FetchFunctionConfig,
  type FetchFunctionResult,
} from "@fiftyone/utilities";
import { createAbortError } from "../../utils/cancellation";
import { safeNumber } from "./bigint-utils";
import { parseByteSize } from "./byte-size";
import { createByteSourceLocationRegistry } from "./resolved-location-registry";
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
  // A manifest publishes handles, and redeeming one authorizes the read and
  // mints a signature. Held per content so that hop is paid once for a
  // source rather than once per range a reader asks for.
  const locations = createByteSourceLocationRegistry();

  return {
    async stat(source, signal) {
      if (signal?.aborted) {
        throw createAbortError(HTTP_BYTE_READ_ABORT_MESSAGE);
      }
      const fetchBytes: AbortableFetchFunction =
        fetchFunction ?? getFetchFunctionExtended();
      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      signal?.addEventListener("abort", onExternalAbort, { once: true });

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
              browserCache: "no-store",
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
        if (signal?.aborted) {
          throw createAbortError(HTTP_BYTE_READ_ABORT_MESSAGE);
        }
        // HEAD is only an optimization; object stores and CORS policies often
        // block it even when ranged GETs are allowed.
        return undefined;
      } finally {
        signal?.removeEventListener("abort", onExternalAbort);
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
      const readFrom = async (path: string) => {
        // Abort is best-effort; withHttpByteReadTimeout is the actual
        // guarantee that readBytes does not wait forever on a hung request.
        const controller = new AbortController();
        const onExternalAbort = () => controller.abort();
        request.signal?.addEventListener("abort", onExternalAbort);
        try {
          return await withHttpByteReadTimeout(
            (onProgress) =>
              fetchBytes<undefined, ArrayBuffer>({
                headers: {
                  Range: `bytes=${request.range.offset.toString()}-${endOffset.toString()}`,
                },
                method: "GET",
                path,
                result: "arrayBuffer",
                retries: DEFAULT_HTTP_BYTE_READ_RETRIES,
                signal: controller.signal,
                onProgress,
                // The app has its own byte caches; letting the browser HTTP
                // cache store these blocks risks a cached superset answering a
                // narrower Range with a mismatched Content-Range.
                browserCache: "no-store",
              }),
            controller,
            httpByteReadInactivityTimeoutMs(expectedLength),
          );
        } catch (error) {
          // Deliberate aborts must be distinguishable from transport failures.
          if (request.signal?.aborted) {
            throw createAbortError(HTTP_BYTE_READ_ABORT_MESSAGE);
          }
          throw error;
        } finally {
          request.signal?.removeEventListener("abort", onExternalAbort);
        }
      };

      // A location resolved by an earlier read skips the hop that resolved
      // it. Should it have lapsed, the handle is what re-authorizes, so it is
      // redeemed again rather than failing a read the caller can still have.
      const known = locations.recall(request.source);
      let result: FetchFunctionResult<ArrayBuffer>;
      if (known === undefined) {
        result = await readFrom(request.source.url);
      } else {
        try {
          result = await readFrom(known);
        } catch (error) {
          if (request.signal?.aborted || !isStaleLocationError(error)) {
            throw error;
          }
          locations.forget(request.source);
          result = await readFrom(request.source.url);
        }
      }
      const { headers, response: buffer } = result;
      if (result.redirected && result.url) {
        locations.remember(request.source, result.url);
      }
      let bytes = new Uint8Array(buffer);

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
      const totalSizeBytes =
        contentRangeMatch[3] === "*" ? undefined : BigInt(contentRangeMatch[3]);
      if (totalSizeBytes !== undefined && contentRangeEnd >= totalSizeBytes) {
        throw new Error(`Invalid Content-Range header '${contentRange}'`);
      }

      // A response stopping at the end of the object satisfies a request that
      // reached past it. Refusing it forces a reader with no recorded size to
      // spend a round trip asking for one before every read - which is what a
      // manifest derived from a stored reference always is.
      const endsAtObjectEnd =
        totalSizeBytes !== undefined && contentRangeEnd + 1n === totalSizeBytes;
      if (
        contentRangeStart > request.range.offset ||
        (!endsAtObjectEnd &&
          contentRangeEnd < request.range.offset + request.range.length - 1n)
      ) {
        throw new Error(
          `Expected Content-Range covering ${request.range.offset.toString()}-${
            request.range.offset + request.range.length - 1n
          } but received '${contentRange}'`,
        );
      }

      const spanLength = safeNumber(contentRangeEnd - contentRangeStart + 1n);
      if (bytes.byteLength !== spanLength) {
        throw new Error(
          `Expected ${spanLength} bytes but received ${bytes.byteLength}`,
        );
      }
      const sliceStart = safeNumber(request.range.offset - contentRangeStart);
      const availableLength = Math.max(0, spanLength - sliceStart);
      const returnedLength = Math.min(expectedLength, availableLength);
      if (
        contentRangeStart !== request.range.offset ||
        spanLength !== expectedLength
      ) {
        // Browser HTTP caches may answer a narrow Range with a stored
        // superset block; a copy of the requested window keeps the oversized
        // backing buffer collectable.
        bytes = bytes.slice(sliceStart, sliceStart + returnedLength);
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
        // What actually arrived, which for a read that ran past the end of
        // the object is shorter than what was asked for. `source.sizeBytes`
        // now carries the total the response reported.
        range:
          bytes.byteLength === expectedLength
            ? request.range
            : {
                length: BigInt(bytes.byteLength),
                offset: request.range.offset,
              },
        source,
      };
    },
  };
}

/**
 * Whether a read failed because the location it used is no longer honoured.
 *
 * An object store answers an expired or withdrawn signature with a refusal
 * rather than a redirect, and that refusal is about the location, not the
 * bytes: the same read against the handle re-authorizes and succeeds.
 */
function isStaleLocationError(error: unknown): boolean {
  const code = (error as { code?: number } | null)?.code;
  return (
    code === 400 || code === 401 || code === 403 || code === 404 || code === 410
  );
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
