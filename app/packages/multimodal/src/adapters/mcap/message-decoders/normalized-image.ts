import { resourceHintsForArrayBufferViews } from "../../../decoders/index";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  DecodedTiming,
} from "../../../ir/index";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { decodeImageRgba } from "./image-encodings";

const EMPTY_RGBA = new Uint8Array(0);

/** Wire-neutral inputs for constructing a normalized raw-image output. */
export interface NormalizedRawImageInput {
  readonly attributes?: Readonly<Record<string, DecodedAttributeValue>>;
  readonly bigEndian: boolean;
  readonly coordinateFrameId?: string;
  readonly data: Uint8Array;
  readonly encoding: string;
  readonly height: number;
  readonly messageTimestamp?: bigint;
  readonly retainUnsupportedData: boolean;
  readonly sourceLabel: string;
  readonly step: number;
  readonly timing: DecodedTiming;
  readonly width: number;
}

/**
 * Builds normalized image attributes, resource hints, and visualization data.
 */
export function buildNormalizedRawImageOutput({
  attributes: wireAttributes,
  bigEndian,
  coordinateFrameId,
  data,
  encoding,
  height,
  messageTimestamp,
  retainUnsupportedData,
  sourceLabel,
  step,
  timing,
  width,
}: NormalizedRawImageInput): DecodedOutput {
  const result = decodeImageRgba({
    bigEndian,
    data,
    encoding,
    height,
    sourceLabel,
    step,
    width,
  });
  const attributes = {
    ...wireAttributes,
    byteLength: data.byteLength,
    encoding,
    height,
    step,
    width,
    ...result.attributes,
    ...(result.unsupportedReason
      ? { unsupportedReason: result.unsupportedReason }
      : {}),
  };

  if (!result.rgba && !result.depth) {
    return {
      attributes,
      ...(retainUnsupportedData
        ? { resourceHints: resourceHintsForArrayBufferViews(data) }
        : {}),
      timing,
    };
  }

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(
      ...(result.rgba ? [result.rgba] : []),
      ...(result.depth ? [result.depth.values] : []),
    ),
    timing,
    visualization: {
      ...(coordinateFrameId ? { coordinateFrameId } : {}),
      ...(result.depth ? { depth: result.depth } : {}),
      height,
      kind: VISUALIZATION_KIND.RAW_IMAGE,
      rgba: result.rgba ?? EMPTY_RGBA,
      sourceEncoding: encoding,
      ...(messageTimestamp !== undefined
        ? { timestampNs: messageTimestamp }
        : {}),
      width,
    },
  };
}
