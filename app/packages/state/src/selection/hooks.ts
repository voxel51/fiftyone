import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback } from "react";
import {
  MAX_SELECTION_BUCKETS,
  newSelectionBucketId,
  normalizeSelectionBucketName,
  PRIMARY_SELECTION_BUCKET,
  selectionCaptureKey,
  selectionDomainDataset,
  selectionMemberKey,
  type SelectionBucket,
} from "./model";
import {
  boundaryAtom,
  bucketCapturesAtom,
  bucketCommandAtom,
  bucketsAtom,
  clearBucketAtom,
  foldRevealedAtom,
  membershipAtom,
  refreshMetadataAtom,
  resolvedTargetAtom,
  selectionAtom,
  scopeRevisionAtom,
  targetBucketAtom,
} from "./model/atoms";
import type {
  EpisodeSelection,
  SelectionBoundary,
  SelectionMember,
} from "./types";

/** Read one bucket's dataset-isolated captures. Browsing changes never rewrite this map. */
export function useEpisodeSelection(
  datasetId: string,
  bucketId: string = PRIMARY_SELECTION_BUCKET,
) {
  return useAtomValue(selectionAtom(selectionCaptureKey(datasetId, bucketId)));
}

/** Commands capture whole groups into one bucket; there is no individual-segment toggle. */
export function useEpisodeSelectionActions(
  datasetId: string,
  bucketId: string = PRIMARY_SELECTION_BUCKET,
) {
  const set = useSetAtom(
    selectionAtom(selectionCaptureKey(datasetId, bucketId)),
  );
  const dispatch = useSetAtom(bucketCommandAtom(datasetId));
  // Captures go through the bucket command so a copy of a parent another
  // bucket already describes inherits that description.
  const capture = useCallback(
    (candidate: EpisodeSelection, operation: "replace" | "add" = "replace") =>
      dispatch({ type: "capture", bucketId, group: candidate, operation }),
    [dispatch, bucketId],
  );
  const remove = useCallback(
    (episodeId: string) =>
      set((current) => {
        if (!current.has(episodeId)) return current;
        const next = new Map(current);
        next.delete(episodeId);
        return next;
      }),
    [set],
  );
  const clear = useCallback(() => set(new Map()), [set]);
  // An async subset write only deselects its captured members, preserving any
  // selections added while it was in flight, including other segments.
  const removeMembers = useCallback(
    (members: readonly SelectionMember[]) => {
      const keys = new Set(members.map(selectionMemberKey));
      set((current) => {
        const next = new Map(current);
        for (const [id, group] of current) {
          const remaining = group.members.filter(
            (member) => !keys.has(selectionMemberKey(member)),
          );
          if (!remaining.length) next.delete(id);
          else if (remaining.length !== group.members.length)
            next.set(id, { ...group, members: remaining });
        }
        return next;
      });
    },
    [set],
  );
  return { capture, remove, removeMembers, clear };
}

/** Read and update the browsing boundary independently of captured choices. */
export function useSelectionBoundary(datasetId: string) {
  return [
    useAtomValue(boundaryAtom(datasetId)),
    useSetAtom(boundaryAtom(datasetId)),
  ] as const;
}

/** Prepares an empty selection in a domain before switching the grid to it. */
export function useOpenSelectionBoundary() {
  const store = useStore();
  return useCallback(
    (domainId: string, boundary: SelectionBoundary) => {
      store.set(bucketCommandAtom(domainId), { type: "clear-all" });
      store.set(boundaryAtom(domainId), boundary);
    },
    [store],
  );
}

/** Refresh display metadata in every bucket while preserving captured members. */
export function useRefreshSelectionMetadata(datasetId: string) {
  return useSetAtom(refreshMetadataAtom(datasetId));
}

/** Version of live subset membership used to invalidate candidate and grid reads. */
export function useSelectionScopeRevision(datasetId: string) {
  return useAtomValue(scopeRevisionAtom(datasetId));
}

/** How far one bucket's folded strip has been revealed, with controls to reveal more or reset. */
export function useFoldRevealed(
  datasetId: string,
  bucketId: string = PRIMARY_SELECTION_BUCKET,
) {
  const key = selectionCaptureKey(datasetId, bucketId);
  const revealed = useAtomValue(foldRevealedAtom(key));
  const set = useSetAtom(foldRevealedAtom(key));
  const reveal = useCallback(
    (count: number) => set((current) => current + count),
    [set],
  );
  const reset = useCallback(() => set(0), [set]);
  return { revealed, reveal, reset };
}

/** Refresh scope after an additive write or an explicit reopen. */
export function useInvalidateSelectionScope(datasetId: string) {
  const set = useSetAtom(scopeRevisionAtom(datasetId));
  return useCallback(() => set((current) => current + 1), [set]);
}

/* ---------------------------------------------------------------------------
 * Buckets
 * ------------------------------------------------------------------------- */

/** The dataset's ordered bucket layout. One bucket is the plain tray. */
export function useSelectionBuckets(datasetId: string) {
  return useAtomValue(bucketsAtom(datasetId));
}

/** Add, rename, decorate, or drop buckets in a dataset's layout. */
export function useSelectionBucketActions(datasetId: string) {
  const set = useSetAtom(bucketsAtom(datasetId));
  // Adding a bucket is the opt-in to multiple selections; the new id comes
  // back so callers can point the user at it. Null means the layout is full.
  const add = useCallback(() => {
    let id: string | null = null;
    set((current) => {
      if (current.length >= MAX_SELECTION_BUCKETS) return current;
      id = newSelectionBucketId();
      return [...current, { id }];
    });
    return id as string | null;
  }, [set]);
  const update = useCallback(
    (bucketId: string, patch: Pick<SelectionBucket, "name" | "icon">) =>
      set((current) =>
        current.map((bucket) => {
          if (bucket.id !== bucketId) return bucket;
          const next: SelectionBucket = { id: bucket.id };
          const name =
            "name" in patch
              ? normalizeSelectionBucketName(patch.name)
              : bucket.name;
          const icon = "icon" in patch ? patch.icon : bucket.icon;
          if (name) Object.assign(next, { name });
          if (icon) Object.assign(next, { icon });
          return next;
        }),
      ),
    [set],
  );
  const remove = useCallback(
    (bucketId: string) =>
      set((current) =>
        current.length > 1
          ? current.filter((bucket) => bucket.id !== bucketId)
          : current,
      ),
    [set],
  );
  const restore = useCallback(
    (bucket: SelectionBucket, index: number) =>
      set((current) => {
        if (
          current.length >= MAX_SELECTION_BUCKETS ||
          current.some((entry) => entry.id === bucket.id)
        )
          return current;
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, bucket);
        return next;
      }),
    [set],
  );
  return { add, update, remove, restore };
}

/** Every configured bucket's captures in the domain, keyed by bucket id. */
export function useSelectionBucketCaptures(datasetId: string) {
  return useAtomValue(bucketCapturesAtom(datasetId));
}

/** Which buckets hold each captured parent. */
export function useSelectionMembership(datasetId: string) {
  return useAtomValue(membershipAtom(datasetId));
}

/** The bucket actions apply to, and a way to choose another. */
export function useSelectionTarget(datasetId: string) {
  const target = useAtomValue(resolvedTargetAtom(datasetId));
  const set = useSetAtom(targetBucketAtom(datasetId));
  const setTarget = useCallback(
    (bucketId: string | null) => set(bucketId ?? ""),
    [set],
  );
  return { target, setTarget };
}

/** Commands that reach across every bucket in the domain. */
export function useSelectionBucketCommands(datasetId: string) {
  const dispatch = useSetAtom(bucketCommandAtom(datasetId));
  const removeEverywhere = useCallback(
    (episodeId: string) => dispatch({ type: "remove-everywhere", episodeId }),
    [dispatch],
  );
  const removeMembersEverywhere = useCallback(
    (members: readonly SelectionMember[]) =>
      dispatch({ type: "remove-members-everywhere", members }),
    [dispatch],
  );
  const clearAll = useCallback(
    () => dispatch({ type: "clear-all" }),
    [dispatch],
  );
  const removeSnapshotsEverywhere = useCallback(
    (snapshotIds: readonly string[]) =>
      dispatch({ type: "remove-snapshots-everywhere", snapshotIds }),
    [dispatch],
  );
  return {
    removeEverywhere,
    removeMembersEverywhere,
    removeSnapshotsEverywhere,
    clearAll,
  };
}

/**
 * Drops a bucket from the layout and its captures from this domain and the
 * persisted samples view, so nothing lingers under an id no bucket owns.
 */
export function useRemoveSelectionBucket(domainId: string) {
  const datasetId = selectionDomainDataset(domainId);
  const { remove } = useSelectionBucketActions(datasetId);
  const clearDomain = useSetAtom(clearBucketAtom(domainId));
  const clearDataset = useSetAtom(clearBucketAtom(datasetId));
  return useCallback(
    (bucketId: string) => {
      clearDomain(bucketId);
      if (datasetId !== domainId) clearDataset(bucketId);
      // A target pointing at the removed bucket falls back on its own.
      remove(bucketId);
    },
    [clearDomain, clearDataset, datasetId, domainId, remove],
  );
}

/** Empty one bucket in the domain, resetting its fold. */
export function useClearSelectionBucket(domainId: string) {
  return useSetAtom(clearBucketAtom(domainId));
}
