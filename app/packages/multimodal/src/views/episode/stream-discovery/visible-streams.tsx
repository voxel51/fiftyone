import { useTileId } from "@fiftyone/tiling";
import { createStreamPublication } from "../../../extensions/host/stream-publication";

const publication = createStreamPublication();

/** Collects the effective stream bindings published by mounted episode tiles. */
export const VisibleStreamsProvider = publication.Provider;

/** Publishes one tile's effective streams; rebind and unmount stay isolated. */
export function usePublishVisibleStreams(streamIds: readonly string[]): void {
  publication.usePublishStreams(useTileId(), streamIds);
}

/** Returns the deterministic union currently displayed by mounted tiles. */
export function useVisibleStreamIds(): readonly string[] {
  return publication.usePublishedStreams();
}
