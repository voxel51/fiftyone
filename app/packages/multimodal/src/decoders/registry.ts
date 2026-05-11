import type { Decoder, PayloadDescriptor } from "./types";

/**
 * Stable string key for one encoded payload descriptor.
 */
export function payloadDescriptorKey(payload: PayloadDescriptor): string {
  return JSON.stringify([
    payload.encoding,
    payload.schemaEncoding ?? null,
    payload.schema ?? null,
  ]);
}

/**
 * Runtime registry of decoders keyed by encoded payload identity.
 */
export class DecoderRegistry {
  private readonly decodersByPayloadKey = new Map<string, Decoder>();

  /**
   * Registers a decoder instance.
   */
  register(decoder: Decoder): void {
    const key = payloadDescriptorKey(decoder.payload);
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
  find(payload: PayloadDescriptor): Decoder | undefined {
    return this.decodersByPayloadKey.get(payloadDescriptorKey(payload));
  }

  /**
   * Lists registered decoders.
   */
  list(): readonly Decoder[] {
    return [...this.decodersByPayloadKey.values()];
  }
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
