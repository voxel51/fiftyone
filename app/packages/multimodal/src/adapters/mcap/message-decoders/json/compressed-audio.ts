import type { Decoder } from "../../../../decoders/index";
// Context-only timing helper; nothing protobuf-specific despite its home.
import { timingFromContext } from "../foxglove/protobuf/timing";
import { compressedAudioOutput } from "../foxglove/compressed-audio";
import { decodeJsonMediaMessage } from "./decode";
import { JSON_FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD } from "./payloads";

/**
 * Decoder for JSON-encoded `foxglove.CompressedAudio` messages: `data` is
 * base64 rather than raw bytes and `timestamp` is `{sec, nsec}`, matching
 * the Foxglove JSON schema registry.
 *
 * Degrades to attributes-only on a shape mismatch, like its JSON siblings.
 */
export const jsonFoxgloveCompressedAudioDecoder: Decoder = {
  id: "json.foxglove.compressed-audio",
  payload: JSON_FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const decoded = decodeJsonMediaMessage(bytes, "CompressedAudio");
    if (!decoded.ok) {
      return {
        attributes: { decodeError: decoded.reason },
        timing: timingFromContext(context, undefined),
      };
    }

    const format = decoded.message.format;
    return compressedAudioOutput({
      data: decoded.data,
      format: typeof format === "string" ? format : "",
      messageTimestamp: decoded.timestampNs,
      timingContext: context,
    });
  },
} as const;
