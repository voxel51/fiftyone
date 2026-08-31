import { useTileId } from "@fiftyone/tiling";
import { createStreamPublication } from "../host/stream-publication";

const publication = createStreamPublication();

/** Viewer-local registry shared by the host and its mounted episode tiles. */
export const AnnotationStreamsProvider = publication.Provider;

/** Publishes one tile's resolved annotation streams for neutral extensions. */
export function usePublishAnnotationStreams(streams: readonly string[]): void {
  const tileId = useTileId();
  publication.usePublishStreams(tileId, streams);
}

/** Returns the sorted annotation-stream union for the current episode viewer. */
export function useSelectedAnnotationStreams(): readonly string[] {
  return publication.usePublishedStreams();
}
