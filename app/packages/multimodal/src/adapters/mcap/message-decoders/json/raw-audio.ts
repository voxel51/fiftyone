import type { Decoder } from "../../../../decoders/index";
import { errorMessage } from "../../../../utils/errors";
// Context-only timing helper; nothing protobuf-specific despite its home.
import { timingFromContext } from "../foxglove/protobuf/timing";
import { rawAudioOutput } from "../foxglove/raw-audio";
import { base64ToBytes, decodeJsonRecord, finiteNumberField, recordField } from "./decode";
import { JSON_FOXGLOVE_RAW_AUDIO_PAYLOAD } from "./payloads";

/**
 * Decoder for JSON-encoded `foxglove.RawAudio` messages — the shape the
 * Foxglove JSON schema registry publishes (and what `mcap-python`-style
 * exporters emit): `data` is a base64 string rather than raw bytes, and
 * `timestamp` is `{sec, nsec}`.
 *
 * Like the other JSON decoders here, shape mismatches DEGRADE to
 * attributes-only output instead of throwing: the synchronized-batch read
 * path has no per-message error isolation, so one throwing decoder would
 * reject whole playback windows for every topic in them.
 */
export const jsonFoxgloveRawAudioDecoder: Decoder = {
  id: "json.foxglove.raw-audio",
  payload: JSON_FOXGLOVE_RAW_AUDIO_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    let message: Record<string, unknown>;
    try {
      message = decodeJsonRecord(bytes);
    } catch (error) {
      return degraded(context, errorMessage(error, "Invalid JSON message"));
    }

    const encoded = message.data;
    if (typeof encoded !== "string") {
      return degraded(context, "JSON RawAudio message has no base64 data");
    }

    let data: Uint8Array;
    try {
      data = base64ToBytes(encoded);
    } catch (error) {
      return degraded(
        context,
        errorMessage(error, "JSON RawAudio data is not valid base64"),
      );
    }

    const timestamp = recordField(message, "timestamp");
    const sec = finiteNumberField(timestamp, "sec");
    const nsec = finiteNumberField(timestamp, "nsec");

    return rawAudioOutput({
      data,
      format: typeof message.format === "string" ? message.format : "",
      messageTimestamp:
        sec === undefined
          ? undefined
          : BigInt(Math.trunc(sec)) * 1_000_000_000n +
            BigInt(Math.trunc(nsec ?? 0)),
      numberOfChannels:
        finiteNumberField(message, "number_of_channels") ??
        finiteNumberField(message, "numberOfChannels") ??
        1,
      sampleRate:
        finiteNumberField(message, "sample_rate") ??
        finiteNumberField(message, "sampleRate") ??
        0,
      timingContext: context,
    });
  },
} as const;

function degraded(
  context: Parameters<typeof timingFromContext>[0],
  decodeError: string,
) {
  return {
    attributes: { decodeError },
    timing: timingFromContext(context, undefined),
  };
}
