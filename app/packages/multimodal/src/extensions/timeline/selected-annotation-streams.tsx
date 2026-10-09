import { useTileId } from "@fiftyone/tiling";
import { useMemo } from "react";
import { STREAM_METADATA, type SceneSource } from "../../ir";
import { createStreamPublication } from "../host/stream-publication";

const publication = createStreamPublication();

/** Viewer-local registry shared by the host and its mounted episode tiles. */
export const AnnotationStreamsProvider = publication.Provider;

/** Publishes one tile's annotation streams eligible for label tracks. */
export function usePublishAnnotationStreams(
  streams: readonly string[],
  sources: readonly SceneSource[],
): void {
  const tileId = useTileId();
  const labelStreams = useMemo(() => {
    const excluded = new Set(
      sources
        .filter(
          (source) =>
            source.metadata?.[STREAM_METADATA.LABEL_TRACKS] === "false",
        )
        .map((source) => source.id),
    );
    return streams.filter((stream) => !excluded.has(stream));
  }, [sources, streams]);
  publication.usePublishStreams(tileId, labelStreams);
}

/** Returns the sorted annotation-stream union for the current episode viewer. */
export function useSelectedAnnotationStreams(): readonly string[] {
  return publication.usePublishedStreams();
}
