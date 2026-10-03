/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Look-ahead prefetch for modal next/previous navigation
 * (FOEPD-4052, Phase 1: images).
 *
 * Once the modal settles on a sample, this warms the samples around it so
 * arrowing to them is instant:
 *
 *   1. GraphQL (all media types): fetch and RETAIN each neighbor's
 *      `mainSample` query, so `modalSample` resolves from the Relay store
 *      on navigation instead of the network.
 *   2. Media (images only in this phase): load the media into a held
 *      `<img>`, so the looker's request for the same URL is served from
 *      memory. Other media types no-op.
 *
 * Both happen in `warmModalSample` (@fiftyone/state). The current sample is
 * held as soon as it opens (retain only, its data is already live), so once
 * the user moves on it stays in the store as the look-behind neighbor
 * instead of being refetched.
 *
 * Neighbors come from `navigation.peek(offset)`, which reads the spotlight
 * cursor without moving it. When the modal has no navigation with `peek`
 * (it can be opened without one), the hook is a no-op.
 */
import * as fos from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { useRelayEnvironment } from "react-relay";

// Offsets from the current sample to warm: two ahead, since forward
// navigation is the common case, and one behind.
const NEIGHBOR_OFFSETS = [1, 2, -1];

// Wait for navigation to settle before warming, so holding an arrow key
// does not start downloads that the next step would throw away.
export const SETTLE_MS = 250;

// Save-Data is an explicit user preference; speculative downloads are exactly
// the traffic it exists to stop. `connection` is non-standard (Chromium only).
const prefersReducedData = (): boolean =>
  Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData,
  );

/** A sample to warm or hold: its id and its generation-scoped key. */
export type WarmTarget = { id: string; key: string };

export type Reconciliation = {
  /** Neighbors not yet warmed, to warm now. */
  toWarm: WarmTarget[];
  /** Existing keys outside the current window or generation, to release. */
  toEvict: string[];
};

/**
 * Warm keys are `${generation}::${sampleId}`; the generation bundles the
 * query-variable inputs, so changing any of them evicts prior entries.
 */
export const keyFor = (generation: string, id: string): string =>
  `${generation}::${id}`;

/**
 * Decide what to warm and evict given the current sample, the peeked
 * neighbor ids, and the existing keys. The current sample is kept but never
 * warmed: its data is already live, and the hook holds it on open.
 */
export function reconcileWindow({
  currentId,
  generation,
  neighborIds,
  existingKeys,
}: {
  currentId: string;
  generation: string;
  neighborIds: string[];
  existingKeys: Iterable<string>;
}): Reconciliation {
  const existing = new Set(existingKeys);
  const currentKey = keyFor(generation, currentId);
  const keep = new Set<string>([currentKey]);
  const toWarm: WarmTarget[] = [];
  const queued = new Set<string>();

  for (const id of neighborIds) {
    const key = keyFor(generation, id);
    keep.add(key);
    if (id === currentId || existing.has(key) || queued.has(key)) {
      continue;
    }
    queued.add(key);
    toWarm.push({ id, key });
  }

  const toEvict: string[] = [];
  for (const key of existing) {
    if (!keep.has(key)) {
      toEvict.push(key);
    }
  }

  return { toWarm, toEvict };
}

export default function useModalPrefetch() {
  const environment = useRelayEnvironment();
  const current = fos.useModalSelector();

  // Inputs to a sample's query variables or media URL. When any of these
  // change, warmed entries belong to a stale generation and are released
  // (the same id then needs different variables or a different URL).
  const datasetName = fos.useCurrentDatasetName();
  const view = fos.useView();
  const mediaField = fos.useSelectedMediaFieldModal();
  // The dataset's group slice: one value for the grid and the modal.
  const slice = fos.useGridGroupSlice();
  const sliceSelect = fos.useModalGroupSlice();
  const hasGroupSlices = fos.useHasGroupSlices();

  // `${generation}::${sampleId}` -> release
  const warmed = useRef(new Map<string, fos.WarmedModalSample>());

  // Re-warm the window once the current sample (or a variable input)
  // settles.
  useEffect(() => {
    // Nothing to prefetch in the early-return states below. Release what
    // is held too, so retains and images don't outlive the modal.
    const flush = () => {
      for (const entry of warmed.current.values()) {
        entry.release();
      }
      warmed.current.clear();
    };

    if (!current?.id) {
      flush();
      return undefined;
    }
    const currentId = current.id;
    const currentGroupId = current.groupId;

    const peek = fos.modalNavigation.get()?.peek;
    if (!peek || prefersReducedData()) {
      flush();
      return undefined;
    }

    // Mirror modalSample's variables guard: it runs no query here.
    if (hasGroupSlices && (!slice || !sliceSelect)) {
      flush();
      return undefined;
    }

    const generation = JSON.stringify([
      datasetName,
      view,
      mediaField,
      slice,
      sliceSelect,
    ]);

    // The variables modalSample will read with once this sample is current.
    const variablesFor = (id: string, groupId: string | undefined) =>
      fos.buildModalSampleVariables({
        dataset: datasetName,
        view,
        id,
        slice: slice || null,
        sliceSelect,
        groupId: slice ? groupId || null : null,
      });

    // Hold the current sample now, not after the settle: a fast run of
    // arrow steps then leaves every sample passed through in the store,
    // and the one just left becomes the look-behind neighbor for free.
    const currentKey = keyFor(generation, currentId);
    if (!warmed.current.has(currentKey)) {
      const retained = fos.retainModalSample(
        environment,
        variablesFor(currentId, currentGroupId),
      );
      warmed.current.set(currentKey, { release: () => retained.dispose() });
    }

    let cancelled = false;

    const settle = async () => {
      // Peek one offset at a time: the peeks share the spotlight cursor,
      // and soft reads are not guaranteed safe to interleave.
      const neighbors = new Map<string, fos.ModalNavigationPeek>();
      for (const offset of NEIGHBOR_OFFSETS) {
        if (cancelled) {
          return;
        }
        const peeked = await peek(offset).catch(() => null);
        if (peeked) {
          neighbors.set(peeked.id, peeked);
        }
      }

      if (cancelled) {
        return;
      }

      const { toWarm, toEvict } = reconcileWindow({
        currentId,
        generation,
        neighborIds: [...neighbors.keys()],
        existingKeys: warmed.current.keys(),
      });

      for (const { id, key } of toWarm) {
        warmed.current.set(
          key,
          fos.warmModalSample(
            environment,
            variablesFor(id, neighbors.get(id)?.groupId),
            mediaField,
          ),
        );
      }

      // Release after warming, so a record kept across a generation change
      // with unchanged variables never drops out of the store in between.
      for (const key of toEvict) {
        warmed.current.get(key)?.release();
        warmed.current.delete(key);
      }
    };

    const timer = setTimeout(() => {
      settle().catch((error: unknown) =>
        console.warn("Failed to prefetch modal neighbors", error),
      );
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    current,
    datasetName,
    view,
    mediaField,
    slice,
    sliceSelect,
    hasGroupSlices,
    environment,
  ]);

  // Release everything on unmount.
  useEffect(() => {
    const map = warmed.current;
    return () => {
      for (const entry of map.values()) {
        entry.release();
      }
      map.clear();
    };
  }, []);
}
