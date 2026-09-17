/**
 * Runtime video-decode capability, asked of the client rather than assumed. A
 * fixed allowlist is wrong in both directions: it refuses HEVC the client
 * decodes natively, and accepts codecs it cannot decode at all - whose refusal
 * then surfaces as a read that never completes.
 */

/** Decoder families a container or manifest codec string classifies into. */
export type VideoCodecFamily = "av1" | "h264" | "h265" | "unknown" | "vp9";

/** The support query, shaped like the config the decoder will configure with. */
interface VideoCodecProbeConfig {
  readonly codec: string;
  readonly hardwareAcceleration: "no-preference";
  readonly optimizeForLatency: true;
}

/** Injectable WebCodecs surface; defaults to the global one. */
export interface VideoCodecSupportEnvironment {
  readonly VideoDecoder?: {
    isConfigSupported(
      config: VideoCodecProbeConfig,
    ): Promise<{ readonly supported?: boolean }>;
  };
}

/**
 * Representative codec string per family, for the descriptor-time answer taken
 * before a stream's container header is read. Each is its family's most broadly
 * implemented profile, so a refusal condemns the family, not one profile.
 */
const FAMILY_PROBE_CODEC: Readonly<
  Record<Exclude<VideoCodecFamily, "unknown">, string>
> = {
  av1: "av01.0.04M.08",
  h264: "avc1.42E01E",
  h265: "hev1.1.6.L93.B0",
  vp9: "vp09.00.10.08",
};

/** Families assumed decodable wherever no probe can run (no WebCodecs, SSR). */
const ASSUMED_SUPPORTED_FAMILIES: ReadonlySet<VideoCodecFamily> = new Set([
  "av1",
  "h264",
]);

const familySupport = new Map<VideoCodecFamily, boolean>();
const codecSupport = new Map<string, Promise<boolean>>();

/** Classifies a manifest or container codec string into its decoder family. */
export function videoCodecFamily(codec: string): VideoCodecFamily {
  const normalized = codec.toLowerCase();
  if (/^(?:av01|av1)/.test(normalized)) return "av1";
  if (/^(?:hvc1|hev1|h265|hevc)/.test(normalized)) return "h265";
  if (/^(?:vp09|vp9)/.test(normalized)) return "vp9";
  if (/^(?:avc1|avc3|h264)/.test(normalized)) return "h264";
  return "unknown";
}

/**
 * The codec string to configure a decoder with for Annex B input. `hvc1`
 * declares HEVC parameter sets out of band and `hev1` in band; a client may
 * accept only the fourcc matching what it is handed.
 */
export function annexBDecoderCodecString(codec: string): string {
  return videoCodecFamily(codec) === "h265"
    ? codec.replace(/^hvc1/i, "hev1")
    : codec;
}

/**
 * Probes every family once so synchronous descriptor construction can answer
 * from a snapshot. Idempotent: per-codec results are memoized.
 */
export async function warmVideoCodecSupport(
  environment?: VideoCodecSupportEnvironment,
): Promise<void> {
  const probes = Object.entries(FAMILY_PROBE_CODEC).map(([family, codec]) =>
    isVideoCodecSupported(codec, environment).then((supported) => {
      familySupport.set(family as VideoCodecFamily, supported);
    }),
  );
  await Promise.all(probes);
}

/**
 * Whether the client can decode this family at all. Synchronous so stream
 * descriptors stay synchronous; before {@link warmVideoCodecSupport} resolves
 * it reports the assumed families.
 */
export function isVideoCodecFamilySupported(family: VideoCodecFamily): boolean {
  if (family === "unknown") return false;
  return familySupport.get(family) ?? ASSUMED_SUPPORTED_FAMILIES.has(family);
}

/** Whether the client can decode this exact codec string. Memoized per string. */
export function isVideoCodecSupported(
  codec: string,
  environment?: VideoCodecSupportEnvironment,
): Promise<boolean> {
  const cached = codecSupport.get(codec);
  if (cached) return cached;
  const probe = probeVideoCodec(codec, environment);
  codecSupport.set(codec, probe);
  return probe;
}

/** Drops memoized results so a test can install its own environment. */
export function resetVideoCodecSupport(): void {
  familySupport.clear();
  codecSupport.clear();
}

async function probeVideoCodec(
  codec: string,
  environment: VideoCodecSupportEnvironment = globalThis as VideoCodecSupportEnvironment,
): Promise<boolean> {
  const decoder = environment.VideoDecoder;
  if (!decoder) return ASSUMED_SUPPORTED_FAMILIES.has(videoCodecFamily(codec));
  try {
    const support = await decoder.isConfigSupported({
      codec,
      hardwareAcceleration: "no-preference",
      optimizeForLatency: true,
    });
    return support.supported === true;
  } catch {
    // isConfigSupported rejects a codec string it cannot parse, which is the
    // answer: nothing here can decode it.
    return false;
  }
}
