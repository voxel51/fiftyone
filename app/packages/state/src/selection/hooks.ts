import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { updateEpisodeSelection } from "./model";
import { boundaryAtom, selectionAtom, scopeRevisionAtom } from "./model/atoms";
import type { EpisodeSelection } from "./types";

/** Read dataset-isolated captures. Browsing changes never rewrite this map. */
export function useEpisodeSelection(datasetId: string) {
  return useAtomValue(selectionAtom(datasetId));
}

/** Commands capture whole groups; there is no individual-segment toggle. */
export function useEpisodeSelectionActions(datasetId: string) {
  const set = useSetAtom(selectionAtom(datasetId));
  const capture = useCallback(
    (candidate: EpisodeSelection, operation: "replace" | "add" = "replace") =>
      set((current) => {
        const next = new Map(current);
        next.set(
          candidate.episodeId,
          updateEpisodeSelection(
            current.get(candidate.episodeId),
            candidate,
            operation,
          ),
        );
        return next;
      }),
    [set],
  );
  const remove = useCallback(
    (episodeId: string) =>
      set((current) => {
        const next = new Map(current);
        next.delete(episodeId);
        return next;
      }),
    [set],
  );
  const clear = useCallback(() => set(new Map()), [set]);
  return { capture, remove, clear };
}

/** Read and update the browsing boundary independently of captured choices. */
export function useSelectionBoundary(datasetId: string) {
  return [
    useAtomValue(boundaryAtom(datasetId)),
    useSetAtom(boundaryAtom(datasetId)),
  ] as const;
}

/** Refresh display metadata while preserving every captured member reference. */
export function useRefreshSelectionMetadata(datasetId: string) {
  const set = useSetAtom(selectionAtom(datasetId));
  return useCallback(
    (
      metadata: Record<
        string,
        Pick<EpisodeSelection, "filepath" | "previewStart" | "unavailable">
      >,
    ) =>
      set(
        (current) =>
          new Map(
            [...current].map(([id, group]) => [
              id,
              metadata[id] ? { ...group, ...metadata[id] } : group,
            ]),
          ),
      ),
    [set],
  );
}

/** Version of live subset membership used to invalidate candidate and grid reads. */
export function useSelectionScopeRevision(datasetId: string) {
  return useAtomValue(scopeRevisionAtom(datasetId));
}

/** Refresh scope after an additive write or an explicit reopen. */
export function useInvalidateSelectionScope(datasetId: string) {
  const set = useSetAtom(scopeRevisionAtom(datasetId));
  return useCallback(() => set((current) => current + 1), [set]);
}
