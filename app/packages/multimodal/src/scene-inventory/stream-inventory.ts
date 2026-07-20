import { SCENE_SOURCE_METADATA, type SceneSource } from "../ir";
import type { StreamInventory } from "../schemas/v1";

/** Builds renderer-facing scene sources from adapter-normalized inventory. */
export function sceneSourcesFromStreamInventory(
  streams: readonly StreamInventory[],
): readonly SceneSource[] {
  const classified = streams.flatMap((stream) => {
    const type = stream.metadata[SCENE_SOURCE_METADATA.TYPE];
    if (!type) return [];
    const sourceName =
      stream.metadata[SCENE_SOURCE_METADATA.SOURCE_NAME] ??
      stream.displayName ??
      stream.streamId;
    const recordCount = parseCount(stream.recordCount);
    return [
      {
        id: stream.streamId,
        label: sourceLabel(sourceName),
        metadata: normalizedSceneMetadata(stream.metadata),
        ...(recordCount === undefined ? {} : { recordCount }),
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
            streams.find((stream) => stream.streamId === source.id)?.metadata[
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
  const segments = sourceName.split("/").filter(Boolean);
  return displaySourceName(segments[0] ?? sourceName);
}

function displaySourceName(sourceName: string): string {
  return sourceName.replace(/^\//, "");
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}
