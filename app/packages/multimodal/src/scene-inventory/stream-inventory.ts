import {
  SCENE_SOURCE_METADATA,
  type SceneSource,
  type StreamDescriptor,
} from "../ir";
import { streamPrefix } from "../stream-selection";

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
          label: displaySourceName(
            streams.find((stream) => stream.id === source.id)?.metadata?.[
              SCENE_SOURCE_METADATA.SOURCE_NAME
            ] ?? source.id,
          ),
        }
      : source,
  );
}

function normalizedSceneMetadata(
  metadata: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  const calibrationStreamId =
    metadata[SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID];
  return calibrationStreamId
    ? { [SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID]: calibrationStreamId }
    : undefined;
}

function sourceLabel(sourceName: string): string {
  return displaySourceName(streamPrefix(sourceName) || sourceName);
}

function displaySourceName(sourceName: string): string {
  return sourceName.replace(/^\//, "");
}
