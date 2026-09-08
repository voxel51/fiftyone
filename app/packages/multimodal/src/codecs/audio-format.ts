/**
 * Compressed audio codecs `foxglove.CompressedAudio` may carry, limited to
 * what the browser's WebCodecs `AudioDecoder` can actually decode. Anything
 * outside this table is treated as unsupported at the decoder layer, the
 * same policy `video-format.ts` applies beyond H.264.
 *
 * `webCodec` is the RFC 6381-style string `AudioDecoder.configure()` and
 * `AudioDecoder.isConfigSupported()` expect — the exchange format between
 * Foxglove's free-form `format` field and the browser API.
 */
const AUDIO_FORMATS = Object.freeze({
  // Opus only, deliberately.
  //
  // `AudioDecoder.configure()` needs the stream's real sample rate and
  // channel count, and `foxglove.CompressedAudio` carries neither — it has
  // only a `format` string. Opus is decodable regardless because it always
  // operates at 48 kHz internally, so a fixed config is correct for it.
  //
  // AAC/MP3/FLAC would each need their true rate (and AAC an
  // AudioSpecificConfig `description`) to configure a decoder, so listing
  // them here would claim support that fails at runtime. They degrade to
  // metadata-only with an "unsupported" reason instead. Adding one means
  // sourcing that configuration — from the container or by parsing the
  // first frame header — and verifying it against a real fixture.
  opus: { exact: ["opus"], label: "Opus", webCodec: "opus" },
} as const);

export type SupportedAudioFormat = keyof typeof AUDIO_FORMATS;

export function audioCodecFromFormat(
  format: string,
): SupportedAudioFormat | null {
  const normalized = format.trim().toLowerCase();
  for (const [codec, definition] of Object.entries(AUDIO_FORMATS) as Array<
    [SupportedAudioFormat, (typeof AUDIO_FORMATS)[SupportedAudioFormat]]
  >) {
    if ((definition.exact as readonly string[]).includes(normalized)) {
      return codec;
    }
  }
  return null;
}

/** The `AudioDecoder.configure()` codec string for a supported format. */
export function webCodecForAudioFormat(format: SupportedAudioFormat): string {
  return AUDIO_FORMATS[format].webCodec;
}

export function audioFormatLabel(format: SupportedAudioFormat): string {
  return AUDIO_FORMATS[format].label;
}

export function unsupportedAudioFormatReason(
  source: string,
  format: string,
): string {
  const trimmed = format.trim();
  return trimmed
    ? `${source} format '${trimmed}' is unsupported`
    : `${source} format is missing`;
}
