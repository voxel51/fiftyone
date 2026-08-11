import type {
  DecodedOutput,
  DecodedSourceTimestamps,
  PayloadDescriptor,
  PointCloudRenderChannelPayload,
} from "../ir";

/** Runtime context passed to payload decoders by format adapters. */
export interface DecodeContext {
  /** Active point-cloud color source requested by the presentation layer. */
  readonly pointCloudColorBy?: string;
  readonly schemaData?: Uint8Array;
  readonly sourceTimestamps?: DecodedSourceTimestamps;
  readonly streamId?: string;
  /** Worker-local cancellation signal; never crosses the worker boundary. */
  readonly signal?: AbortSignal;
  readonly timeRangeStartKey?: string;
  readonly timeRangeStartNs?: bigint;
  readonly [key: string]: unknown;
}

/** Frontend decoder implementation for one encoded payload family. */
export interface Decoder {
  readonly id: string;
  readonly payload: PayloadDescriptor;
  readonly version: string;

  decode(this: void, bytes: Uint8Array, ctx: DecodeContext): DecodedOutput;
  /** Optional packed-data fast path for replacing one point-cloud channel. */
  projectPointCloudChannel?(
    this: void,
    bytes: Uint8Array,
    ctx: DecodeContext,
    request: PointCloudChannelProjectionRequest,
  ): PointCloudRenderChannelPayload;
}

/** Immutable geometry identity used to project one replacement color channel. */
export interface PointCloudChannelProjectionRequest {
  readonly activeColorBy: string;
  readonly capacity: number;
  readonly sampledPointCount: number;
  readonly samplePlanKey: string;
  readonly sourceIndices: Uint32Array;
}
