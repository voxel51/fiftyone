import type { ByteSourceDescriptor } from "../ir";
import type {
  EpisodeOpenOptions,
  EpisodePreviewSession,
  EpisodeSession,
  EpisodeSource,
  SampleDescriptor,
} from "../ports";
import { byteSourceAccessKey } from "../query/bytes";
import { createMultimodalQueryClient } from "../query";
import { loadFormatAdapter } from "./adapter-registry";

// The cached client, not the raw one: block fill, the memory and Cache API
// layers, and in-flight coalescing all live here. Reading straight through
// puts one request on the wire per demuxer read - tens of KB each - which a
// remote source cannot serve fast enough to keep playback fed.
const episodeByteResources = createMultimodalQueryClient().bytes;

/** Stable identity for one concrete source access path. */
export function episodeSourceAccessKey(source: ByteSourceDescriptor): string {
  return byteSourceAccessKey(source);
}

/** Detects an adapter and opens its full episode session. */
export async function openEpisodeSession(
  sample: SampleDescriptor,
  source: EpisodeSource,
  options?: EpisodeOpenOptions,
): Promise<EpisodeSession> {
  const adapterPromise = loadFormatAdapter(sample, options);
  const hintsPromise = source.resolveHints
    ? source.resolveHints(options).catch((error: unknown) => {
        if (options?.signal?.aborted) throw error;
        return null;
      })
    : Promise.resolve(null);
  const [adapter, hints] = await Promise.all([adapterPromise, hintsPromise]);
  if (!adapter) {
    throw new Error("No episode adapter recognized this sample");
  }
  const { resolveHints: _resolveHints, ...baseSource } = source;
  const resolvedSource =
    hints?.adapterId === adapter.id
      ? {
          ...baseSource,
          ...((source.manifestHint ?? hints.manifestHint)
            ? { manifestHint: source.manifestHint ?? hints.manifestHint }
            : {}),
          ...((source.playbackHint ?? hints.playbackHint)
            ? { playbackHint: source.playbackHint ?? hints.playbackHint }
            : {}),
        }
      : baseSource;
  return adapter.open(resolvedSource, episodeByteResources, options);
}

/** Detects an adapter and opens its lightweight preview when supported. */
export async function openEpisodePreviewSession(
  sample: SampleDescriptor,
  source: EpisodeSource,
  options?: EpisodeOpenOptions,
): Promise<EpisodePreviewSession | null> {
  const adapter = await loadFormatAdapter(sample, options);
  return adapter?.openPreview?.(source, episodeByteResources, options) ?? null;
}
