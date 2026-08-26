import {
  resourceHintsForArrayBufferViews,
  type Decoder,
} from "../../../../decoders/index";
import type {
  DecodedAttributeValue,
  DecodedOutput,
} from "../../../../ir/index";
import { VISUALIZATION_KIND } from "../../../../ir/visualization-kinds";
import {
  audioCodecFromFormat,
  unsupportedAudioFormatReason,
} from "../../../../codecs/audio-format";
import {
  bytesField,
  recordField,
  rosTimestampNs,
  stringField,
} from "../ros/common";
import { rosDecodersForPayloads } from "../ros/factory";
import { FOXGLOVE_COMPRESSED_AUDIO_CDR_PAYLOADS } from "./payloads";
import { decodeProtobufMessage } from "./protobuf/index";
import { FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD } from "./protobuf/payloads";
import {
  optionalRecord,
  optionalString,
  requiredBytes,
} from "./protobuf/records";
import { timestampNs, timingFromContext } from "./protobuf/timing";

const SOURCE = "Foxglove CompressedAudio";

/**
 * Decoder for Foxglove CompressedAudio protobuf messages.
 */
export const foxgloveCompressedAudioDecoder: Decoder = {
  id: "foxglove.compressed-audio",
  payload: FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD,
      context,
    );
    return compressedAudioOutput({
      data: requiredBytes(message, "data"),
      format: optionalString(message, "format") ?? "",
      messageTimestamp: timestampNs(optionalRecord(message, "timestamp")),
      timingContext: context,
    });
  },
} as const;

/**
 * Decoders for Foxglove CompressedAudio messages carried over ROS 2 CDR.
 */
export const foxgloveCompressedAudioCdrDecoders = Object.freeze(
  rosDecodersForPayloads({
    id: "foxglove.compressed-audio.cdr",
    map(message, context) {
      return compressedAudioOutput({
        data: bytesField(message, "data"),
        format: stringField(message, "format"),
        messageTimestamp: rosTimestampNs(recordField(message, "timestamp")),
        timingContext: context,
      });
    },
    payloads: FOXGLOVE_COMPRESSED_AUDIO_CDR_PAYLOADS,
  }),
);

export function compressedAudioOutput({
  data,
  format,
  messageTimestamp,
  timingContext,
}: {
  readonly data: Uint8Array;
  readonly format: string;
  readonly messageTimestamp?: bigint;
  readonly timingContext: Parameters<typeof timingFromContext>[0];
}): DecodedOutput {
  const displayFormat = format.trim() ? format : "unknown";
  const attributes: Record<string, DecodedAttributeValue> = {
    byteLength: data.byteLength,
    format: displayFormat,
  };

  const codec = audioCodecFromFormat(format);
  if (!codec) {
    attributes.unsupportedReason = unsupportedAudioFormatReason(SOURCE, format);
    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing: timingFromContext(timingContext, messageTimestamp),
    };
  }

  attributes.codec = codec;

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(data),
    timing: timingFromContext(timingContext, messageTimestamp),
    visualization: {
      bytes: data,
      format: displayFormat,
      kind: VISUALIZATION_KIND.ENCODED_AUDIO,
      ...(messageTimestamp !== undefined
        ? { timestampNs: messageTimestamp }
        : {}),
    },
  };
}
