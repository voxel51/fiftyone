import {
  SCENE_SOURCE_METADATA,
  STREAM_METADATA,
  type SceneSource,
  type StreamDescriptor,
} from "../ir";
import { streamPrefix } from "./stream-selection";

/** Builds renderer-facing scene sources from adapter-normalized inventory. */
export function sceneSourcesFromStreamDescriptors(
  streams: readonly StreamDescriptor[],
): readonly SceneSource[] {
  const classified = streams.flatMap((stream) => {
    const metadata = stream.metadata ?? {};
    const type = metadata[SCENE_SOURCE_METADATA.TYPE];
    if (!type) return [];
    const sourceName =
      metadata[SCENE_SOURCE_METADATA.SOURCE_NAME] ?? stream.sourceName;
    return [
      {
        id: stream.id,
        label: sourceLabel(sourceName),
        metadata: normalizedSceneMetadata(metadata),
        ...(stream.count === undefined ? {} : { recordCount: stream.count }),
        sourceName,
        type,
      },
    ];
  });

  const labelCounts = new Map<string, number>();
  for (const source of classified) {
    labelCounts.set(source.label, (labelCounts.get(source.label) ?? 0) + 1);
  }
  return classified.map((source) =>
    (labelCounts.get(source.label) ?? 0) > 1
      ? {
          ...source,
          label: displaySourceName(source.sourceName),
        }
      : source,
  );
}

function normalizedSceneMetadata(
  metadata: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  // Decode status and its schema name travel with the source so a tile can
  // report a codec refusal. Without them the tile only knows it has no frames,
  // which it renders as a timestamp gap - unreadable as a permanent refusal.
  const carried: Record<string, string> = {};
  for (const key of [
    SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID,
    STREAM_METADATA.DECODE_STATUS,
    STREAM_METADATA.LABEL_TRACKS,
    STREAM_METADATA.SCHEMA_NAME,
  ]) {
    const value = metadata[key];
    if (value) carried[key] = value;
  }
  return Object.keys(carried).length > 0 ? carried : undefined;
}

function sourceLabel(sourceName: string): string {
  return displaySourceName(streamPrefix(sourceName) || sourceName);
}

function displaySourceName(sourceName: string): string {
  return sourceName.replace(/^\//, "");
}
