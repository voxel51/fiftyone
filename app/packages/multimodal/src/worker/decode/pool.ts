import type {
  DecodedOutput,
  DecodeContext,
  PayloadDescriptor,
} from "../../decoders";

// TODO: implement the decoder pool.

/**
 * Decode request shape for worker-backed decoder pools.
 */
export interface DecodeJob {
  readonly bytes: Uint8Array;
  readonly context: DecodeContext;
  readonly payload: PayloadDescriptor;
}

/**
 * Scaffold for pooled decode execution.
 */
export abstract class DecoderPool {
  /**
   * Decodes a typed message payload.
   */
  abstract decode(message: DecodeJob): DecodedOutput | Promise<DecodedOutput>;

  /**
   * Releases decoder pool resources.
   */
  abstract dispose(): void;
}
