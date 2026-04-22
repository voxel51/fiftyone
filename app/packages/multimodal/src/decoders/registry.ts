import { Decoder } from "./types";

/**
 * Lookup key for a registered decoder.
 */
export interface DecoderKey {
  readonly messageEncoding: string;
  readonly schemaName: string;
}

/**
 * Runtime registry of decoders keyed by schema and message encoding.
 */
export class DecoderRegistry {
  private readonly decoders = new Map<string, Decoder>();

  /**
   * Registers a decoder instance.
   */
  register(decoder: Decoder): void {
    const key = `${decoder.messageEncoding}::${decoder.schemaName}`;
    this.decoders.set(key, decoder);
  }

  /**
   * Returns the decoder registered for a key when one exists.
   */
  find(key: DecoderKey): Decoder | undefined {
    return this.decoders.get(`${key.messageEncoding}::${key.schemaName}`);
  }
}

// Todo: construct registry manager, or global sigleton registry
