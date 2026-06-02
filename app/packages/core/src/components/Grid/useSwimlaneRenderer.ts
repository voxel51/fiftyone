/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Renderer that turns each row of the main grid Spotlight into a
 * swimlane row: `[ cover | divider | siblings ]`.
 *
 * - The cover is the default-slice sample (already returned by the
 *   main grid query) and renders via the standard sample renderer.
 * - The siblings strip is an inner horizontal Spotlight that fetches
 *   the other slices of the same group via
 *   {@link groupSiblingsPageParameters}. A bouncing-pixels overlay
 *   shows until the inner Spotlight fires `load`.
 *
 * Outer Spotlight stays in charge. This hook is opt-in: Grid.tsx
 * picks it when the swimlanes toggle is on, otherwise falls back to
 * the standard {@link useRenderer}.
 */

import Spotlight from "@fiftyone/spotlight";
import type { Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilCallback } from "recoil";
import styles from "./Grid.module.css";
import { groupSiblingsPageParameters } from "./recoil";
import type { LookerCache } from "./types";
import useRenderer from "./useRenderer";
import type { SampleStore } from "./useSpotlightPager";

const PAGE_SIZE = 20;

export default function useSwimlaneRenderer({
  cache,
  id,
  records,
  store,
}: {
  cache: LookerCache;
  id: string;
  records: Map<string, number>;
  store: SampleStore;
}) {
  // The base renderer handles the COVER sample inside each row. We
  // delegate `showItem`/`hideItem`/`detachItem` for the cover; the
  // swimlane wrapper adds the siblings strip alongside.
  const base = useRenderer({ cache, id, records, store });

  // Per-row inner Spotlight, keyed by the cover sample's id. The
  // outer Spotlight reuses row elements across show/hide cycles, so
  // we create the inner spotlight on first show and keep it for the
  // element's lifetime; `detachItem` destroys it.
  const inner = useRef(new Map<string, Spotlight<number, fos.Sample>>());
  const wheelHandlers = useRef(
    new Map<
      string,
      { element: HTMLElement; handler: (e: WheelEvent) => void }
    >()
  );

  // Resolve a per-group pager. We snapshot recoil at call time
  // because the per-row pager is created inside a non-React callback.
  const buildSiblingsPager = useRecoilCallback(
    ({ snapshot }) =>
      async (groupId: string) => {
        const factory = await snapshot.getPromise(
          groupSiblingsPageParameters(groupId)
        );
        return factory;
      },
    []
  );

  /**
   * Construct the [.cover | .separator | .siblings] DOM scaffolding
   * inside `element` once. Subsequent shows reuse the same children.
   * Returns the three child nodes for callers to populate.
   */
  const ensureRowScaffold = useCallback((element: HTMLElement) => {
    let row = element.querySelector<HTMLElement>(`.${styles.swimlaneRow}`);
    if (row) {
      const cover = row.querySelector<HTMLElement>(`.${styles.swimlaneCover}`)!;
      const siblings = row.querySelector<HTMLElement>(
        `.${styles.swimlaneSiblings}`
      )!;
      const pixels = siblings.querySelector<HTMLElement>(
        `.${styles.bouncingPixels}`
      )!;
      return { row, cover, siblings, pixels };
    }
    row = document.createElement("div");
    row.className = styles.swimlaneRow;

    const cover = document.createElement("div");
    cover.className = styles.swimlaneCover;

    const separator = document.createElement("div");
    separator.className = styles.swimlaneSeparator;
    // Inline 1px vertical line — matches voodo Divider's column
    // variant without depending on the React tree here.
    const line = document.createElement("div");
    line.style.width = "1px";
    line.style.height = "100%";
    line.style.background = "var(--fo-palette-text-placeholder)";
    separator.appendChild(line);

    const siblings = document.createElement("div");
    siblings.className = styles.swimlaneSiblings;

    const pixels = document.createElement("div");
    pixels.className = styles.bouncingPixels;
    siblings.appendChild(pixels);

    row.appendChild(cover);
    row.appendChild(separator);
    row.appendChild(siblings);
    element.appendChild(row);
    return { row, cover, siblings, pixels };
  }, []);

  const showItem = useCallback<Show<number, fos.Sample>>(
    (args) => {
      const { id, element, dimensions, spotlight, zooming } = args;
      const { cover, siblings, pixels } = ensureRowScaffold(element);

      // Cover dimensions: the row is `height = dimensions.height`,
      // the cover is a square at the row's full height (CSS
      // `aspect-ratio: 1/1` on `.swimlaneCover`).
      const coverSize = {
        width: dimensions.height,
        height: dimensions.height,
      };
      const coverPromise = base.renderer.showItem({
        ...args,
        element: cover,
        dimensions: coverSize,
      });

      // Lazily set up the inner Spotlight for this row.
      if (!inner.current.has(id.description)) {
        const sample = store.get(id) as fos.Sample | undefined;
        // GroupId lives on the sample's group field — read defensively
        // since not every dataset is grouped.
        const groupId = (
          sample as unknown as { sample?: { _group?: { id?: string } } }
        )?.sample?._group?.id;

        if (groupId) {
          const innerSpotlight = createInnerSpotlight({
            groupId,
            cache,
            store,
            records,
            renderer: base.renderer,
            buildSiblingsPager,
            onLoad: () => pixels.classList.add(styles.hidden),
          });
          inner.current.set(id.description, innerSpotlight);
          innerSpotlight.attach(siblings);
        }

        // Route horizontal wheel to the inner spotlight, vertical to
        // the outer (so the user can scroll through groups while the
        // pointer is over a row).
        const handler = (e: WheelEvent) => {
          if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
            e.preventDefault();
            e.stopPropagation();
            (siblings.firstElementChild as HTMLElement)?.scrollBy(e.deltaX, 0);
          }
        };
        siblings.addEventListener("wheel", handler, { passive: false });
        wheelHandlers.current.set(id.description, {
          element: siblings,
          handler,
        });
      }

      return coverPromise;
    },
    [
      base.renderer,
      buildSiblingsPager,
      cache,
      ensureRowScaffold,
      records,
      store,
    ]
  );

  const hideItem = useCallback<Hide>(
    (args) => base.renderer.hideItem(args),
    [base.renderer]
  );

  const detachItem = useCallback(
    (id: ID) => {
      base.renderer.detachItem(id);
      const innerSpotlight = inner.current.get(id.description);
      if (innerSpotlight) {
        innerSpotlight.destroy();
        inner.current.delete(id.description);
      }
      const binding = wheelHandlers.current.get(id.description);
      if (binding) {
        binding.element.removeEventListener("wheel", binding.handler);
        wheelHandlers.current.delete(id.description);
      }
    },
    [base.renderer]
  );

  return {
    getFontSize: base.getFontSize,
    lookerOptions: base.lookerOptions,
    renderer: useMemo(
      () => ({
        detachItem,
        hideItem,
        showItem,
      }),
      [detachItem, hideItem, showItem]
    ),
  };
}

interface InnerSpotlightArgs {
  groupId: string;
  cache: LookerCache;
  store: SampleStore;
  records: Map<string, number>;
  renderer: ReturnType<typeof useRenderer>["renderer"];
  buildSiblingsPager: (
    groupId: string
  ) => Promise<(page: number, pageSize: number) => Record<string, unknown>>;
  onLoad: () => void;
}

/**
 * Build the per-row horizontal Spotlight that lists the cover
 * group's sibling slices. Cover sample is intentionally NOT excluded
 * server-side — the renderer skips it on render so the cover doesn't
 * visually duplicate.
 */
function createInnerSpotlight({
  cache: _cache,
  groupId: _groupId,
  renderer,
  onLoad,
}: InnerSpotlightArgs): Spotlight<number, fos.Sample> {
  // TODO: thread a real per-row fetch through. For the first cut we
  // stand the inner Spotlight up with a no-op `get` so the bouncing
  // pixels stay visible and the row layout/wheel routing can be
  // validated in the browser. Next pass: call `buildSiblingsPager`
  // and wire its variables through `fetchQuery` like
  // `useSpotlightPager` does for the main grid.
  const s = new Spotlight<number, fos.Sample>({
    key: 0,
    offset: 0,
    horizontal: true,
    scrollbar: true,
    spacing: 4,
    rowAspectRatioThreshold: () => 3,
    get: async () => ({ items: [], next: null, previous: null }),
    ...renderer,
  });
  s.addEventListener("load", onLoad);
  return s;
}
