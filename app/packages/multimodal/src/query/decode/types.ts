import type { DecodeContext, Decoder } from "../../decoders";
import type { DecodedOutput, PayloadDescriptor } from "../../decoders";
import type { ByteSourceDescriptor } from "../bytes";

/**
 * Record identity used to cache decoded payload output.
 */
export interface DecodeCacheDescriptor {
  /**
   * Optional discriminator for decoder settings that affect output for the
   * same encoded payload, such as active timeline interpretation.
   */
  readonly decoderOptionsKey?: string;

  /**
   * Source that produced the encoded payload, included when source identity is
   * needed to keep decoded outputs distinct.
   */
  readonly source?: ByteSourceDescriptor;

  /**
   * Stable record/message identity within the stream.
   */
  readonly recordId: string;

  /**
   * Stream identity that produced the payload.
   */
  readonly streamId: string;

  /**
   * Playback or source timeline timestamp for this decoded output, when the
   * payload is time-addressed.
   */
  readonly timeNs?: bigint;
}

/**
 * Request for decoding one encoded payload into playback/visualization output.
 */
export interface DecodeRequest {
  /**
   * Encoded payload bytes passed to the selected decoder.
   */
  readonly bytes: Uint8Array;

  /**
   * Optional decoded-output cache identity. Omit for one-off decodes that
   * should not be reused.
   */
  readonly cache?: DecodeCacheDescriptor;

  /**
   * Runtime context supplied to decoders, such as stream id, schema data, and
   * source timestamps.
   */
  readonly context: DecodeContext;

  /**
   * Payload metadata used to select a compatible decoder.
   */
  readonly payload: PayloadDescriptor;
}

/**
 * Result of decoding one encoded payload.
 */
export interface DecodeResult {
  /**
   * Identifier of the decoder that produced output.
   */
  readonly decoderId: string;

  /**
   * Decoder version included in cache identity and diagnostics.
   */
  readonly decoderVersion: string;

  /**
   * Decoded playback/visualization payload.
   */
  readonly output: DecodedOutput;

  /**
   * Payload descriptor that was decoded.
   */
  readonly payload: PayloadDescriptor;
}

/**
 * Request passed to the pluggable decode execution engine.
 */
export interface DecodeExecutionRequest {
  /**
   * Encoded payload bytes to decode.
   */
  readonly bytes: Uint8Array;

  /**
   * Runtime context forwarded to the decoder.
   */
  readonly context: DecodeContext;

  /**
   * Concrete decoder selected by the registry.
   */
  readonly decoder: Decoder;

  /**
   * Payload descriptor matched by decoder.
   */
  readonly payload: PayloadDescriptor;
}

/**
 * Execution strategy for decoder work. The default executor runs inline, while
 * hot playback callers can inject a worker-backed executor without changing the
 * cache/registry API.
 */
export interface DecodeExecutor {
  /**
   * Runs the selected decoder inline, in a worker, or through another execution
   * strategy.
   */
  decode(
    request: DecodeExecutionRequest
  ): DecodedOutput | Promise<DecodedOutput>;
}

/**
 * Fully resolved decoded cache key.
 */
export interface DecodedOutputCacheKey {
  /**
   * Identifier of the decoder that produced the cached output.
   */
  readonly decoderId: string;

  /**
   * Optional discriminator for decoder options that affect output.
   */
  readonly decoderOptionsKey?: string;

  /**
   * Decoder version used to invalidate stale decoded outputs.
   */
  readonly decoderVersion: string;

  /**
   * Payload metadata decoded into the cached output.
   */
  readonly payload: PayloadDescriptor;

  /**
   * Stable record/message identity within the stream.
   */
  readonly recordId: string;

  /**
   * Source identity included when equivalent record ids can appear across
   * different sources.
   */
  readonly source?: ByteSourceDescriptor;

  /**
   * Stream identity that produced the payload.
   */
  readonly streamId: string;

  /**
   * Playback or source timeline timestamp for time-addressed output.
   */
  readonly timeNs?: bigint;
}

/**
 * Cache contract for decoded playback/visualization outputs.
 */
export interface DecodedOutputCache {
  /**
   * Returns a cached decoded result for the fully resolved cache key.
   */
  get(key: DecodedOutputCacheKey): Promise<DecodeResult | undefined>;

  /**
   * Stores a decoded result under the fully resolved cache key.
   */
  put(key: DecodedOutputCacheKey, result: DecodeResult): Promise<void>;

  /**
   * Evicts all decoded outputs.
   */
  clear(): Promise<void>;
}

/**
 * Generic client for decoding payload bytes into playback/visualization outputs.
 */
export interface DecodeClient {
  /**
   * Selects a decoder for the payload, optionally reuses cached output, and
   * returns the decoded visualization/playback result.
   */
  decode(request: DecodeRequest): Promise<DecodeResult>;
}
