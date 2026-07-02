/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Look-ahead prefetch for modal next/previous navigation
 * (FOEPD-4052, Phase 1: image datasets).
 *
 * On each modal sample change, warms neighboring samples so arrowing to them
 * is instant:
 *
 *   1. GraphQL (all media types) — fetch and RETAIN each neighbor's
 *      `mainSample` query. The modal env uses `gcReleaseBufferSize: 0`, so the
 *      retain is what lets `modalSample` resolve from the Relay store on
 *      navigation instead of the network.
 *   2. Media (images only in this phase) — decode the media URL into a
 *      retained `new Image()` so the bitmap is in memory when the looker
 *      mounts the same src. Other media types no-op (`resolveModalMediaSrc`).
 *
 * Neighbors come from `navigation.peek(offset)`, which reads the spotlight
 * cursor without moving it. Grouped / dynamic-group navigation does not
 * provide `peek`, so the hook no-ops there (Phase 2).
 */
import { mainSample, type mainSampleQuery } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";
import {
  createOperationDescriptor,
  getRequest,
  type IEnvironment,
} from "relay-runtime";

// Forward navigation is more common than backward.
const LOOKAHEAD = 2;
const LOOKBEHIND = 1;

// Save-Data is an explicit user preference; speculative downloads are exactly
// the traffic it exists to stop. `connection` is non-standard (Chromium only).
const prefersReducedData = (): boolean =>
  Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData,
  );

/** A neighbor to warm: its sample id and its generation-scoped cache key. */
export type WarmTarget = { id: string; key: string };

export type Reconciliation = {
  /** Fresh neighbors (not already warmed) to warm now. */
  toWarm: WarmTarget[];
  /** Existing keys outside the current window/generation to release. */
  toEvict: string[];
};

/**
 * Warm keys are `${generation}::${sampleId}`; the generation bundles the
 * query-variable inputs, so changing any of them evicts prior entries.
 */
export const keyFor = (generation: string, id: string): string =>
  `${generation}::${id}`;

/**
 * Decide what to warm and evict given the current sample, the peeked neighbor
 * ids, and the already-warmed keys. The current sample is kept but never
 * warmed (its data is already live).
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
  const keep = new Set<string>([keyFor(generation, currentId)]);
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

/**
 * Resolve the media URL to warm, or `null`. Phase 1 gate: only `ImageSample`
 * media is warmed — video/3D need different machinery (later phases). The
 * caller still warms every media type's GraphQL.
 */
export function resolveModalMediaSrc(
  response: mainSampleQuery["response"],
  mediaField: string,
): string | null {
  const sample = response?.sample;
  if (
    !sample ||
    sample.__typename !== "ImageSample" ||
    !("urls" in sample) ||
    !sample.urls
  ) {
    return null;
  }

  const normalized = fos.getNormalizedUrls(sample.urls);
  const path = normalized[mediaField] ?? normalized.filepath;
  return path ? fos.getSampleSrc(path) : null;
}

/**
 * Warm a media URL by decoding it into an `<img>`. The returned element must
 * stay referenced (see `WarmEntry`) — dropping it would let the browser free
 * the decoded bitmap before navigation reaches it.
 */
const warmImage = (src: string): HTMLImageElement => {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image;
};

type WarmEntry = {
  /** Dispose the retain, cancel the in-flight fetch, free the warmed image. */
  release: () => void;
};

export default function useModalPrefetch() {
  const environment = useRelayEnvironment();
  const current = useRecoilValue(fos.modalSelector);

  // Inputs that change a sample's query variables. When any of these change,
  // previously warmed entries belong to a stale generation and are flushed
  // (the same id then needs different variables / a different media URL).
  const datasetName = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.view);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const slice = useRecoilValue(fos.groupSlice);

  // `${generation}::${sampleId}` -> teardown
  const warmed = useRef(new Map<string, WarmEntry>());

  const warm = useRecoilCallback(
    ({ snapshot }) =>
      (env: IEnvironment, key: string, selector: fos.ModalSelector) => {
        const id = selector.id;
        if (!id || warmed.current.has(key)) {
          return;
        }

        const groupSlice = snapshot.getLoadable(fos.groupSlice).getValue();
        const sliceSelect = snapshot
          .getLoadable(fos.modalGroupSlice)
          .getValue();

        // Mirror modalSample's variables guard (unreachable until grouped
        // navigation gains `peek`).
        const hasSlices = snapshot.getLoadable(fos.hasGroupSlices).getValue();
        if (hasSlices && (!groupSlice || !sliceSelect)) {
          return;
        }

        const variables = fos.buildModalSampleVariables({
          dataset: snapshot.getLoadable(fos.datasetName).getValue(),
          view: snapshot.getLoadable(fos.view).getValue(),
          id,
          slice: groupSlice || null,
          sliceSelect,
          groupId: groupSlice ? (selector.groupId ?? null) : null,
        });
        const field = snapshot
          .getLoadable(fos.selectedMediaField(true))
          .getValue();

        // Pin against gcReleaseBufferSize: 0 so the data survives until nav.
        const operation = createOperationDescriptor(
          getRequest(mainSample),
          variables,
        );
        const retained = env.retain(operation);

        // Referenced until this entry is evicted so the decoded bitmap stays
        // in memory for the navigation it was warmed for.
        let warmedImage: HTMLImageElement | undefined;

        const subscription = fetchQuery<mainSampleQuery>(
          env,
          mainSample,
          variables,
          { fetchPolicy: "store-or-network" },
        ).subscribe({
          next: (data) => {
            // GraphQL is warmed for every media type; media only for images.
            const src = resolveModalMediaSrc(data, field);
            if (src) {
              warmedImage = warmImage(src);
            }
          },
          error: (error) =>
            console.warn(`Failed to prefetch sample ${id}`, error),
        });

        warmed.current.set(key, {
          release: () => {
            subscription.unsubscribe();
            retained.dispose();
            if (warmedImage) {
              // Drop the src so the browser can free the decoded bitmap.
              warmedImage.src = "";
              warmedImage = undefined;
            }
          },
        });
      },
    [],
  );

  // Re-warm the window whenever the current sample (or a variable input)
  // changes.
  useEffect(() => {
    // Nothing to prefetch in the early-return states below — also release
    // anything already warmed so retains/bitmaps don't outlive the modal.
    const flush = () => {
      for (const entry of warmed.current.values()) {
        entry.release();
      }
      warmed.current.clear();
    };

    if (!current?.id) {
      flush();
      return;
    }
    const currentId = current.id;

    const navigation = fos.modalNavigation.get();
    const peek = navigation?.peek;
    if (!peek) {
      flush();
      return;
    }

    if (prefersReducedData()) {
      flush();
      return;
    }

    // One generation per (dataset, view, mediaField, slice); prior-generation
    // entries fall out of `keep` in reconcileWindow and are evicted below.
    const generation = JSON.stringify([datasetName, view, mediaField, slice]);

    const offsets: number[] = [];
    for (let i = 1; i <= LOOKAHEAD; i++) offsets.push(i);
    for (let i = 1; i <= LOOKBEHIND; i++) offsets.push(-i);

    let cancelled = false;

    (async () => {
      // Peek sequentially — the peeks share the spotlight cursor, and soft
      // reads are not guaranteed safe to interleave.
      const selectors: (fos.ModalSelector | null)[] = [];
      for (const offset of offsets) {
        if (cancelled) {
          return;
        }
        selectors.push(await peek(offset).catch(() => null));
      }

      if (cancelled) {
        return;
      }

      const byId = new Map<string, fos.ModalSelector>();
      for (const selector of selectors) {
        if (selector?.id) {
          byId.set(selector.id, selector);
        }
      }

      const { toWarm, toEvict } = reconcileWindow({
        currentId,
        generation,
        neighborIds: [...byId.keys()],
        existingKeys: warmed.current.keys(),
      });

      for (const { id, key } of toWarm) {
        const selector = byId.get(id);
        if (selector) {
          warm(environment, key, selector);
        }
      }

      for (const key of toEvict) {
        warmed.current.get(key)?.release();
        warmed.current.delete(key);
      }
    })().catch((error) => console.warn("Failed to prefetch neighbors", error));

    return () => {
      cancelled = true;
    };
  }, [current, datasetName, view, mediaField, slice, environment, warm]);

  // Release everything on unmount.
  useEffect(() => {
    const map = warmed.current;
    return () => {
      for (const entry of map.values()) entry.release();
      map.clear();
    };
  }, []);
}
