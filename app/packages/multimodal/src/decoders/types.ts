import type { RenderArchetypeKind } from "../archetypes";
import type { PayloadDescriptor as ContractPayloadDescriptor } from "../schemas/v1";

/**
 * Broad decoded value shape until renderer-specific field contracts are
 * finalized.
 */
export type DecodedFieldValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | Uint8Array
  | Float32Array
  | ArrayBuffer
  | readonly DecodedFieldValue[]
  | { readonly [field: string]: DecodedFieldValue };

/**
 * Decoder-owned render data passed to format-agnostic renderers.
 */
export interface RenderBuffers {
  readonly kind: RenderArchetypeKind;
  readonly data: Uint8Array | Float32Array | ArrayBuffer;
  readonly metadata?: Record<string, DecodedFieldValue>;
}

/**
 * Encoded payload identity used by frontend decoder selection.
 */
export type PayloadDescriptor = Readonly<
  Pick<ContractPayloadDescriptor, "encoding" | "schema" | "schemaEncoding">
>;

/**
 * Time range for decoded data. Point samples may omit endNs; interval or
 * segment outputs can provide a natural end.
 */
export interface DecodedTimeRange {
  readonly startNs: bigint;
  readonly endNs?: bigint;
}

/**
 * Named timestamps preserved from the source container or message payload.
 */
export type DecodedSourceTimestamps = Readonly<Record<string, bigint>>;

/**
 * Generic timing metadata for playback, synchronization, and provenance.
 */
export interface DecodedTiming {
  readonly timeRange?: DecodedTimeRange;
  readonly sourceTimestamps?: DecodedSourceTimestamps;
}

/**
 * Structured decoder output for downstream playback and rendering.
 */
export interface DecodedOutput {
  readonly fields: Record<string, DecodedFieldValue>;
  readonly render: RenderBuffers;
  readonly timing?: DecodedTiming;
}

/**
 * Frontend decoder implementation for a specific encoded payload.
 */
export interface Decoder {
  readonly id: string;
  readonly payload: PayloadDescriptor;
  readonly version: string;

  decode<DecoderContext>(bytes: Uint8Array, ctx: DecoderContext): DecodedOutput;
}
