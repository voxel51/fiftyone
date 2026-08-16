import {
  resourceHintsForArrayBufferViews,
  type Decoder,
} from "../../../../decoders/index";
import type { DecodedAttributeValue, DecodedOutput } from "../../../../ir/index";
import { VISUALIZATION_KIND } from "../../../../ir/index";
import {
  pcmFormatFromString,
  pcmFormatLabel,
  samplesFromPcmBytes,
  unsupportedPcmFormatReason,
} from "../pcm-format";
import { bytesField, numberField as rosNumberField, recordField, rosTimestampNs, stringField } from "../ros/common";
import { rosDecodersForPayloads } from "../ros/factory";
import { FOXGLOVE_RAW_AUDIO_CDR_PAYLOADS } from "./payloads";
import { decodeProtobufMessage } from "./protobuf/index";
import { FOXGLOVE_RAW_AUDIO_PAYLOAD } from "./protobuf/payloads";
import { numberField, optionalRecord, optionalString, requiredBytes } from "./protobuf/records";
import { timestampNs, timingFromContext } from "./protobuf/timing";

/**
 * Decoder for Foxglove RawAudio protobuf messages.
 */
export const foxgloveRawAudioDecoder: Decoder = {
  id: "foxglove.raw-audio",
  payload: FOXGLOVE_RAW_AUDIO_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(bytes, FOXGLOVE_RAW_AUDIO_PAYLOAD, context);
    return rawAudioOutput({
      data: requiredBytes(message, "data"),
      format: optionalString(message, "format") ?? "",
      messageTimestamp: timestampNs(optionalRecord(message, "timestamp")),
      numberOfChannels: numberField(message, "numberOfChannels", "number_of_channels", 1),
      sampleRate: numberField(message, "sampleRate", "sample_rate"),
      timingContext: context,
    });
  },
} as const;

/**
 * Decoders for Foxglove RawAudio messages carried over ROS 2 CDR.
 */
export const foxgloveRawAudioCdrDecoders = Object.freeze(
  rosDecodersForPayloads({
    id: "foxglove.raw-audio.cdr",
    map(message, context) {
      return rawAudioOutput({
        data: bytesField(message, "data"),
        format: stringField(message, "format"),
        messageTimestamp: rosTimestampNs(recordField(message, "timestamp")),
        numberOfChannels: rosNumberField(
          message,
          "number_of_channels",
          "numberOfChannels",
          1,
        ),
        sampleRate: rosNumberField(message, "sample_rate", "sampleRate"),
        timingContext: context,
      });
    },
    payloads: FOXGLOVE_RAW_AUDIO_CDR_PAYLOADS,
  }),
);

export function rawAudioOutput({
  data,
  format,
  messageTimestamp,
  numberOfChannels,
  sampleRate,
  timingContext,
}: {
  readonly data: Uint8Array;
  readonly format: string;
  readonly messageTimestamp?: bigint;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly timingContext: Parameters<typeof timingFromContext>[0];
}): DecodedOutput {
  const attributes: Record<string, DecodedAttributeValue> = {
    byteLength: data.byteLength,
    channels: numberOfChannels,
    format: format || "unknown",
    sampleRate,
  };

  const pcmFormat = pcmFormatFromString(format);
  if (!pcmFormat || sampleRate <= 0 || numberOfChannels <= 0) {
    attributes.unsupportedReason = !pcmFormat
      ? unsupportedPcmFormatReason(format)
      : "Foxglove RawAudio requires a positive sample rate and channel count";
    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing: timingFromContext(timingContext, messageTimestamp),
    };
  }

  attributes.pcmFormat = pcmFormatLabel(pcmFormat);
  const samples = samplesFromPcmBytes(pcmFormat, data);

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(data),
    timing: timingFromContext(timingContext, messageTimestamp),
    visualization: {
      channels: numberOfChannels,
      kind: VISUALIZATION_KIND.RAW_AUDIO,
      sampleRate,
      samples,
      ...(messageTimestamp !== undefined ? { timestampNs: messageTimestamp } : {}),
    },
  };
}
