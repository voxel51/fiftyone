import type { Decoder, PayloadDescriptor } from "./types";

/**
 * Lookup key for a registered decoder.
 */
export type DecoderKey = PayloadDescriptor;

/**
 * Runtime registry of decoders keyed by encoded payload identity.
 */
export class DecoderRegistry {
  private readonly decodersByPayloadKey = new Map<string, Decoder>();

  /**
   * Registers a decoder instance.
   */
  register(decoder: Decoder): void {
    const key = payloadKey(decoder.payload);
    const existingDecoder = this.decodersByPayloadKey.get(key);

    if (existingDecoder) {
      throw new Error(
        `Decoder already registered for ${formatDecoderKey(decoder.payload)}`
      );
    }

    this.decodersByPayloadKey.set(key, decoder);
  }

  /**
   * Returns the decoder registered for a key when one exists.
   */
  find(key: DecoderKey): Decoder | undefined {
    return this.decodersByPayloadKey.get(payloadKey(key));
  }
}

// Todo: construct registry manager, or global singleton registry

function payloadKey(payload: PayloadDescriptor): string {
  return JSON.stringify([
    payload.encoding,
    payload.schemaEncoding ?? null,
    payload.schema ?? null,
  ]);
}

function formatDecoderKey(payload: PayloadDescriptor): string {
  const parts = [payload.encoding];
  if (payload.schemaEncoding) {
    parts.push(payload.schemaEncoding);
  }
  if (payload.schema) {
    parts.push(payload.schema);
  }
  return parts.join("/");
}
