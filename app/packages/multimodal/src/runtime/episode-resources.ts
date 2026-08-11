import type { ByteSourceDescriptor } from "../ir";
import type {
  EpisodeOpenOptions,
  EpisodePreviewSession,
  EpisodeSession,
  EpisodeSource,
  SampleDescriptor,
} from "../ports";
import { byteSourceAccessKey, createDefaultByteClient } from "../query/bytes";
import { loadFormatAdapter } from "./adapter-registry";

const episodeByteResources = createDefaultByteClient();

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
  const adapter = await loadFormatAdapter(sample, options);
  if (!adapter) {
    throw new Error("No episode adapter recognized this sample");
  }
  return adapter.open(source, episodeByteResources, options);
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

/** Advises an adapter to warm likely startup bytes when it supports prewarm. */
export async function prewarmEpisodeSource(
  sample: SampleDescriptor,
  source: EpisodeSource,
  signal?: AbortSignal,
): Promise<boolean> {
  const adapter = await loadFormatAdapter(sample, { signal });
  if (!adapter?.prewarm) {
    return false;
  }
  await adapter.prewarm(source, episodeByteResources, { signal });
  return true;
}
