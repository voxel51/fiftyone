import type { Decoder } from "../../../../decoders/index";
import { errorMessage } from "../../../../utils/errors";
// Context-only timing helper; nothing protobuf-specific despite its home.
import { timingFromContext } from "../foxglove/protobuf/timing";
import { compressedAudioOutput } from "../foxglove/compressed-audio";
import { base64ToBytes, decodeJsonRecord, finiteNumberField, recordField } from "./decode";
import { JSON_FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD } from "./payloads";

/**
 * Decoder for JSON-encoded `foxglove.CompressedAudio` messages: `data` is
 * base64 rather than raw bytes and `timestamp` is `{sec, nsec}`, matching
 * the Foxglove JSON schema registry.
 *
 * Degrades to attributes-only on a shape mismatch, like its JSON siblings —
 * the synchronized-batch read path has no per-message error isolation, so a
 * throwing decoder would reject whole playback windows.
 */
export const jsonFoxgloveCompressedAudioDecoder: Decoder = {
  id: "json.foxglove.compressed-audio",
  payload: JSON_FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD,
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
      return degraded(context, "JSON CompressedAudio message has no base64 data");
    }

    let data: Uint8Array;
    try {
      data = base64ToBytes(encoded);
    } catch (error) {
      return degraded(
        context,
        errorMessage(error, "JSON CompressedAudio data is not valid base64"),
      );
    }

    const timestamp = recordField(message, "timestamp");
    const sec = finiteNumberField(timestamp, "sec");
    const nsec = finiteNumberField(timestamp, "nsec");

    return compressedAudioOutput({
      data,
      format: typeof message.format === "string" ? message.format : "",
      messageTimestamp:
        sec === undefined
          ? undefined
          : BigInt(Math.trunc(sec)) * 1_000_000_000n + BigInt(Math.trunc(nsec ?? 0)),
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
