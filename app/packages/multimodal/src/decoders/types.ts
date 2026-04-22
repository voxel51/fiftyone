import { RENDER_ARCHETYPE } from "../archetypes";

/**
 * Render buffer archetypes emitted by multimodal decoders.
 */
export type RenderArchetypeKind = keyof typeof RENDER_ARCHETYPE;

/**
 * Decoder-owned render data passed to format-agnostic renderers.
 */
export interface RenderBuffers {
  readonly kind: RenderArchetypeKind;
  readonly data: Uint8Array | Float32Array | ArrayBuffer;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Structured decoder output for downstream playback and rendering.
 */
export interface DecodedOutput {
  readonly fields: Record<string, unknown>;
  readonly render: RenderBuffers;
  readonly headerStampNs?: bigint;
  readonly publishTimeNs?: bigint;
}

/**
 * Context supplied to decoder implementations at decode time.
 */
export interface DecodeContext {
  readonly streamId: string;
  readonly frameId?: string;
}

/**
 * Message decoder implementation for a specific schema and encoding pair.
 */
export interface Decoder {
  readonly schemaName: string;
  readonly messageEncoding: string;

  decode(bytes: Uint8Array, ctx: DecodeContext): DecodedOutput;
}
