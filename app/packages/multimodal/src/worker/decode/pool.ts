// TODO: implement the decoder pool.

/**
 * Scaffold for pooled decode execution.
 */
export class DecoderPool {
  /**
   * Decodes an opaque message payload.
   */
  decode(_message: unknown): unknown {
    throw new Error("Not implemented");
  }

  /**
   * Releases decoder pool resources.
   */
  dispose(): void {
    throw new Error("Not implemented");
  }
}
