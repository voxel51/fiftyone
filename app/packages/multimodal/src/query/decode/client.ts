import { defaultDecoderRegistry, type DecoderRegistry } from "../../decoders";
import { decodedOutputCacheKey } from "./cache";
import type {
  DecodedOutputCache,
  DecodeExecutor,
  DecodeClient,
  DecodeResult,
} from "./types";

/**
 * Default decode executor. It runs decoder work inline on the caller thread.
 */
export const inlineDecodeExecutor: DecodeExecutor = {
  decode({ bytes, context, decoder }) {
    return decoder.decode(bytes, context);
  },
};

/**
 * Creates a decode client backed by a runtime decoder registry and decoded
 * cache.
 */
export function createDecodeClient({
  cache,
  executor = inlineDecodeExecutor,
  registry = defaultDecoderRegistry,
}: {
  readonly cache: DecodedOutputCache;
  readonly executor?: DecodeExecutor;
  readonly registry?: DecoderRegistry;
}): DecodeClient {
  const pendingDecodes = new Map<string, Promise<DecodeResult>>();

  return {
    async decode(request) {
      const decoder = registry.find(request.payload);
      if (!decoder) {
        const payloadDescription = [
          request.payload.encoding,
          request.payload.schemaEncoding,
          request.payload.schema,
        ]
          .filter(Boolean)
          .join("/");

        throw new Error(`No decoder registered for ${payloadDescription}`);
      }

      // Keep decode execution local to this request so cache/in-flight paths
      // share the same selected decoder and request context.
      const runDecode = async (): Promise<DecodeResult> => ({
        decoderId: decoder.id,
        decoderVersion: decoder.version,
        output: await executor.decode({
          bytes: request.bytes,
          context: request.context,
          decoder,
          payload: request.payload,
        }),
        payload: request.payload,
      });

      const cacheKey = request.cache
        ? {
            decoderId: decoder.id,
            decoderOptionsKey: request.cache.decoderOptionsKey,
            decoderVersion: decoder.version,
            payload: request.payload,
            recordId: request.cache.recordId,
            source: request.cache.source,
            streamId: request.cache.streamId,
            timeNs: request.cache.timeNs,
          }
        : undefined;
      if (!cacheKey) {
        return runDecode();
      }

      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const inFlightKey = decodedOutputCacheKey(cacheKey);
      const pendingDecode = pendingDecodes.get(inFlightKey);
      if (pendingDecode) {
        return pendingDecode;
      }

      const decode = runDecode()
        .then(async (result) => {
          await cache.put(cacheKey, result);
          return result;
        })
        .finally(() => {
          pendingDecodes.delete(inFlightKey);
        });
      pendingDecodes.set(inFlightKey, decode);

      return decode;
    },
  };
}
