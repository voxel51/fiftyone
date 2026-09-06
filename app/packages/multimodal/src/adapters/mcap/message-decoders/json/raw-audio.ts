import type { Decoder } from "../../../../decoders/index";
// Context-only timing helper; nothing protobuf-specific despite its home.
import { timingFromContext } from "../foxglove/protobuf/timing";
import { rawAudioOutput } from "../foxglove/raw-audio";
import { decodeJsonMediaMessage, finiteNumberField } from "./decode";
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
    const decoded = decodeJsonMediaMessage(bytes, "RawAudio");
    if (!decoded.ok) {
      return {
        attributes: { decodeError: decoded.reason },
        timing: timingFromContext(context, undefined),
      };
    }

    const { message } = decoded;
    return rawAudioOutput({
      data: decoded.data,
      format: typeof message.format === "string" ? message.format : "",
      messageTimestamp: decoded.timestampNs,
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
