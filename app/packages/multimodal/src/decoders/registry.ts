import { Decoder } from "./types";

/**
 * Lookup key for a registered decoder.
 */
export interface DecoderKey {
  readonly messageEncoding: string;
  readonly schemaName: string;
}

type MessageEncoding = Decoder["messageEncoding"];
type SchemaName = Decoder["schemaName"];
type DecodersBySchemaName = Map<SchemaName, Decoder>;
type DecodersByMessageEncoding = Map<MessageEncoding, DecodersBySchemaName>;

/**
 * Runtime registry of decoders keyed by schema and message encoding.
 */
export class DecoderRegistry {
  private readonly decodersByMessageEncoding: DecodersByMessageEncoding =
    new Map();

  /**
   * Registers a decoder instance.
   */
  register(decoder: Decoder): void {
    let decodersBySchemaName = this.decodersByMessageEncoding.get(
      decoder.messageEncoding
    );

    if (!decodersBySchemaName) {
      decodersBySchemaName = new Map();
      this.decodersByMessageEncoding.set(
        decoder.messageEncoding,
        decodersBySchemaName
      );
    }

    const existingDecoder = decodersBySchemaName.get(decoder.schemaName);

    if (existingDecoder) {
      throw new Error(
        `Decoder already registered for ${decoder.messageEncoding}/${decoder.schemaName}`
      );
    }

    decodersBySchemaName.set(decoder.schemaName, decoder);
  }

  /**
   * Returns the decoder registered for a key when one exists.
   */
  find(key: DecoderKey): Decoder | undefined {
    return this.decodersByMessageEncoding
      .get(key.messageEncoding)
      ?.get(key.schemaName);
  }
}

// Todo: construct registry manager, or global sigleton registry
