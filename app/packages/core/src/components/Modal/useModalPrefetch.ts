/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Look-ahead prefetch for modal next/previous navigation
 * (FOEPD-4052, Phase 1: image datasets).
 *
 * On each modal sample change, warms a small window of neighbors (N+m forward,
 * N-n back) so arrowing to them is instant, on two layers:
 *
 *   1. GraphQL (ALL media types) — fire each neighbor's `mainSample` query and
 *      RETAIN it. The modal env uses `gcReleaseBufferSize: 0`, so query data is
 *      GC'd the moment nothing is subscribed; retain pins it. On navigation
 *      `modalSample` re-resolves with the neighbor's variables and, because
 *      recoil-relay queries with `store-or-network`, reads straight from the
 *      store — no network round-trip. Because the GraphQL is the slow part, this
 *      is a win for image AND video / 3D / multimodal neighbors alike.
 *   2. Media (images only, Phase 1) — off the response, resolve the modal media
 *      URL and warm it with a `new Image()` that stays referenced until the
 *      entry is evicted, keeping the decoded bitmap in memory. When the Looker
 *      mounts and sets the same `src` (looker/.../elements/image.ts), the
 *      browser serves it from memory (or the HTTP cache) → fast first paint.
 *      Non-image samples no-op the media step (see `resolveModalMediaSrc`);
 *      their media needs different machinery in later phases (Three's
 *      LoadingManager for 3D, etc.).
 *
 * Neighbors come from `navigation.peek(offset)`, which reads the spotlight
 * cursor WITHOUT moving it — the mutating `next`/`previous` would corrupt
 * navigation (see useExpandSample.ts). Grouped / dynamic-group navigation uses a
 * different mechanism and does not set `peek`, so the hook safely no-ops there
 * (Phase 2).
 *
 * The pure decision logic (`resolveWindow`, `reconcileWindow`,
 * `resolveModalMediaSrc`) is exported and unit-tested; the hook itself is thin
 * orchestration over Relay + Recoil.
 *
 * Validate: Network panel — arrowing onto a warmed neighbor should issue NO
 * `/graphql` request and (for images) the media should paint immediately.
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

/** How many samples to warm ahead of / behind the current one. */
export type PrefetchWindow = { lookahead: number; lookbehind: number };

/**
 * Network Information API hints used to scale the window down on metered / slow
 * connections. Passed in as a plain arg (not read from `navigator` here) so the
 * function stays pure and testable.
 */
export type ConnectionHints = { saveData?: boolean; effectiveType?: string };

// Forward navigation is more common than backward (ticket: N + m ahead, N - n
// behind). Fixed default; a user preference could promote this later.
export const DEFAULT_WINDOW: PrefetchWindow = { lookahead: 2, lookbehind: 1 };

const SLOW_EFFECTIVE_TYPES = new Set(["slow-2g", "2g"]);

/**
 * Resolve the prefetch window from connection hints. Honors Save-Data and slow
 * connections by disabling prefetch (don't burn a metered link warming samples
 * the user may never reach); otherwise returns the default window.
 */
export function resolveWindow(hints?: ConnectionHints): PrefetchWindow {
  const slow =
    Boolean(hints?.saveData) ||
    (hints?.effectiveType !== undefined &&
      SLOW_EFFECTIVE_TYPES.has(hints.effectiveType));

  return slow ? { lookahead: 0, lookbehind: 0 } : DEFAULT_WINDOW;
}

/** A neighbor to warm: its sample id and its generation-scoped cache key. */
export type WarmTarget = { id: string; key: string };

export type Reconciliation = {
  /** Fresh neighbors (not already warmed) to warm now. */
  toWarm: WarmTarget[];
  /** Existing keys outside the current window/generation to release. */
  toEvict: string[];
  /** All keys that should remain warm (current + window). */
  keep: Set<string>;
};

/**
 * Warmed entries are keyed `${generation}::${sampleId}`. The generation bundles
 * (dataset, view, mediaField, group slice); when any changes, prior-generation
 * keys fall out of `keep` and are evicted — the same sample id then needs
 * different query variables.
 */
export const keyFor = (generation: string, id: string): string =>
  `${generation}::${id}`;

/**
 * Pure window reconciliation: given the current sample, the freshly-peeked
 * neighbor ids, and the keys already warmed, decide what to warm and evict. The
 * current sample is always kept (it was a neighbor a moment ago) but never
 * warmed (its data is already live). Neighbors already warmed, duplicates, and
 * the current id are excluded from `toWarm`.
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

  return { toWarm, toEvict, keep };
}

/**
 * Resolve the browser media URL to warm for a prefetched sample, or `null` if
 * there's nothing to warm.
 *
 * Phase 1 gate: only `ImageSample` media is warmed. Video / 3D / point-cloud /
 * unknown samples return `null` — their media needs different machinery
 * (Three's LoadingManager for 3D, `<video>` preload for video) that lands in
 * later phases. Only this media step is image-gated; the caller still warms the
 * GraphQL/JSON for every media type.
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

/** Read Network Information API hints, if the browser exposes them. */
const getConnectionHints = (): ConnectionHints | undefined => {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  // `connection` is non-standard (Chromium only); guard + narrow.
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  return connection
    ? { saveData: connection.saveData, effectiveType: connection.effectiveType }
    : undefined;
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
        const variables = fos.buildModalSampleVariables({
          dataset: snapshot.getLoadable(fos.datasetName).getValue(),
          view: snapshot.getLoadable(fos.view).getValue(),
          id,
          slice: groupSlice || null,
          sliceSelect: snapshot.getLoadable(fos.modalGroupSlice).getValue(),
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
    if (!current?.id) {
      return;
    }
    const currentId = current.id;

    const navigation = fos.modalNavigation.get();
    const peek = navigation?.peek;
    if (!peek) {
      return;
    }

    const { lookahead, lookbehind } = resolveWindow(getConnectionHints());
    if (lookahead === 0 && lookbehind === 0) {
      return;
    }

    // One generation per (dataset, view, mediaField, slice); prior-generation
    // entries fall out of `keep` in reconcileWindow and are evicted below.
    const generation = JSON.stringify([datasetName, view, mediaField, slice]);

    const offsets: number[] = [];
    for (let i = 1; i <= lookahead; i++) offsets.push(i);
    for (let i = 1; i <= lookbehind; i++) offsets.push(-i);

    let cancelled = false;

    Promise.all(offsets.map((offset) => peek(offset).catch(() => null)))
      .then((selectors) => {
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
      })
      .catch((error) => console.warn("Failed to prefetch neighbors", error));

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
