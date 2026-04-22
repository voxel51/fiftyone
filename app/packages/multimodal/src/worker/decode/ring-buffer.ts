// TODO: implement the decoded frame ring buffer.

/**
 * Scaffold for buffering decoded multimodal frames.
 */
export class RingBuffer {
  /**
   * Pushes an opaque decoded frame into the buffer.
   */
  push(_frame: unknown): void {
    throw new Error("Not implemented");
  }

  /**
   * Drains buffered frames.
   */
  drain(): readonly unknown[] {
    throw new Error("Not implemented");
  }

  /**
   * Clears buffered frames.
   */
  clear(): void {
    throw new Error("Not implemented");
  }
}
