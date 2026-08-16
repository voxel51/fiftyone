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
  opus: { exact: ["opus"], label: "Opus", webCodec: "opus" },
  aac: { exact: ["aac", "mp4a", "m4a"], label: "AAC", webCodec: "mp4a.40.2" },
  mp3: { exact: ["mp3", "mpeg", "mpga"], label: "MP3", webCodec: "mp3" },
  flac: { exact: ["flac"], label: "FLAC", webCodec: "flac" },
  // Uncompressed PCM occasionally arrives on a CompressedAudio topic;
  // WebCodecs decodes it through the same path rather than needing the
  // RawAudio branch.
  pcm: { exact: ["pcm", "pcm-s16", "lpcm"], label: "PCM", webCodec: "pcm-s16" },
} as const);

export type SupportedAudioFormat = keyof typeof AUDIO_FORMATS;

export function audioCodecFromFormat(format: string): SupportedAudioFormat | null {
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

export function unsupportedAudioFormatReason(source: string, format: string): string {
  const trimmed = format.trim();
  return trimmed
    ? `${source} format '${trimmed}' is unsupported`
    : `${source} format is missing`;
}
