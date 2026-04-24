import type { DecodedOutput } from "../../decoders";

// TODO: implement the decoded frame ring buffer.

/**
 * Buffered decoded frame shape.
 */
export interface BufferedDecodedFrame {
  readonly output: DecodedOutput;
  readonly streamId: string;
  readonly timestampNs: bigint;
}

/**
 * Contract for buffering decoded multimodal frames.
 *
 * The concrete implementation is deferred until playback requirements settle.
 */
export abstract class RingBuffer {
  /**
   * Pushes a decoded frame into the buffer.
   */
  abstract push(frame: BufferedDecodedFrame): void;

  /**
   * Drains buffered frames.
   */
  abstract drain(): readonly BufferedDecodedFrame[];

  /**
   * Clears buffered frames.
   */
  abstract clear(): void;
}
