/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Swimlanes renderer. Each outer-grid row is replaced by a single
 * inner horizontal {@link Spotlight}:
 *
 *   items = [ cover, spacer, ...siblings ]
 *
 * The cover is the default-slice sample (already in the outer
 * store) and is returned synchronously on page 0; the spacer is a
 * synthetic gutter item the width of `gridSpacing` with the grid
 * background; siblings are the group's other-slice samples,
 * fetched lazily on page 1+ via `paginateSamples` (one Relay
 * request per page).
 *
 * Inner Spotlight runs with `fill: true` so the sibling page loads
 * automatically after the cover paints — no horizontal scroll
 * required to see the rest of the group. The shimmer overlay clears
 * on the inner Spotlight's `load` event.
 */

import * as foq from "@fiftyone/relay";
import Spotlight from "@fiftyone/spotlight";
import type { Get, Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import type { VariablesOf } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styles from "./Grid.module.css";
import { gridSpacing, groupSiblingsPageParameters } from "./recoil";
import type { LookerCache } from "./types";
import useRenderer from "./useRenderer";
import type { SampleStore } from "./useSpotlightPager";
import { handleNode } from "./utils";

const SIBLINGS_PAGE_SIZE = 20;

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
  const base = useRenderer({ cache, id, records, store });
  const environment = useRelayEnvironment();
  const groupField = useRecoilValue(fos.groupField);
  const spacing = useRecoilValue(gridSpacing);

  // Per-row inner Spotlight + wheel handler, keyed by the cover
  // sample id. Outer Spotlight reuses row elements; we create the
  // inner once and destroy it only when the outer detaches.
  const innerSpotlights = useRef(
    new Map<string, Spotlight<number, fos.Sample>>()
  );
  const wheelHandlers = useRef(
    new Map<
      string,
      { element: HTMLElement; handler: (e: WheelEvent) => void }
    >()
  );

  const resolveSiblingPager = useRecoilCallback(
    ({ snapshot }) =>
      async (groupId: string) =>
        snapshot.getPromise(groupSiblingsPageParameters(groupId)),
    []
  );

  /** Build the [shimmer-underlay] row scaffold once per element. */
  const ensureScaffold = useCallback((element: HTMLElement) => {
    let row = element.querySelector<HTMLElement>(`.${styles.swimlaneRow}`);
    if (row) {
      return {
        row,
        shimmer: row.querySelector<HTMLElement>(`.${styles.swimlaneShimmer}`)!,
      };
    }
    row = document.createElement("div");
    row.className = styles.swimlaneRow;
    const shimmer = document.createElement("div");
    shimmer.className = styles.swimlaneShimmer;
    row.appendChild(shimmer);
    element.appendChild(row);
    return { row, shimmer };
  }, []);

  const showItem = useCallback<Show<number, fos.Sample>>(
    (args) => {
      const { id: itemId, element, dimensions } = args;
      const key = itemId.description;

      const coverNode = store.get(itemId);
      if (!coverNode) return Promise.resolve(0);

      // Clear Spotlight's default backdrop on the row wrapper.
      const parent = element.parentElement;
      if (parent) parent.style.background = "transparent";
      element.style.background = "transparent";

      const { row, shimmer } = ensureScaffold(element);
      // Reset the shimmer to visible — the element may be reused
      // from a previous (already-loaded) row whose `display: none`
      // would otherwise persist. Margins follow the user's
      // gridSpacing so the shimmer sits inside the row with a
      // uniform top/bottom gutter.
      shimmer.style.display = "";
      shimmer.style.top = `${spacing}px`;
      shimmer.style.bottom = `${spacing}px`;

      if (innerSpotlights.current.has(key)) return Promise.resolve(0);

      const [, rowHeight] = dimensions;
      // Cover sample data is in the outer store; pull its aspect
      // ratio so the cover renders at native size in the inner
      // Spotlight's first row.
      const coverAspect =
        ((coverNode as unknown as { aspectRatio?: number }).aspectRatio &&
        Number.isFinite(
          (coverNode as unknown as { aspectRatio?: number }).aspectRatio
        )
          ? ((coverNode as unknown as { aspectRatio?: number })
              .aspectRatio as number)
          : 1) || 1;

      // Synthetic spacer between cover and first sibling — width
      // matches the user's gridSpacing setting, background reads as
      // the grid surface.
      const spacerId = `__swimlane_spacer__${coverNode.id}`;
      const spacerAspect =
        rowHeight > 0 ? Math.max(0.01, spacing / rowHeight) : 0.01;

      // Resolve cover's group id; siblings can only be fetched on
      // grouped datasets.
      const sample =
        (coverNode as { sample?: Record<string, { _id?: string }> }).sample ??
        {};
      const groupId = groupField ? sample[groupField]?._id : undefined;

      // Helper: hide shimmer once the row's inner pager is
      // exhausted. Deferred to the next frame so Spotlight has a
      // chance to lay out the items first — no visible gap between
      // shimmer vanishing and tiles appearing.
      const hideShimmer = () => {
        requestAnimationFrame(() => {
          shimmer.style.display = "none";
        });
      };

      const innerGet: Get<number, fos.Sample> = async (cursor) => {
        if (cursor === 0) {
          // Page 0 = cover + spacer, returned synchronously. Cover
          // sample is already in the outer store; no Relay request.
          // If there's no group id (non-grouped dataset), this is
          // also the only page — pager exhausted, hide shimmer.
          const next = groupId ? 1 : null;
          if (next === null) hideShimmer();
          return {
            items: [
              {
                key: 0,
                aspectRatio: coverAspect,
                id: itemId,
                data: coverNode as fos.Sample,
              },
              {
                key: 0,
                aspectRatio: spacerAspect,
                id: { description: spacerId },
                data: undefined as unknown as fos.Sample,
              },
            ],
            next,
            previous: null,
          };
        }

        // Page 1+ = siblings via paginateSamples filtered by groupId.
        const factory = await resolveSiblingPager(groupId!);
        const variables = factory(
          cursor - 1,
          SIBLINGS_PAGE_SIZE
        ) as unknown as VariablesOf<foq.paginateSamplesQuery>;
        const data = await new Promise<foq.paginateSamplesQuery["response"]>(
          (resolve, reject) => {
            const sub = fetchQuery<foq.paginateSamplesQuery>(
              environment,
              foq.paginateSamples,
              variables,
              { fetchPolicy: "network-only" }
            ).subscribe({
              next: (d) => {
                resolve(d);
                sub.unsubscribe();
              },
              error: reject,
            });
          }
        );
        if (!foq.isPaginateSamplesConnection(data.samples)) {
          // Connection didn't resolve (timeout / unknown). Pager
          // exhausted — clear the shimmer so we don't loop forever.
          hideShimmer();
          return { items: [], next: null, previous: null };
        }
        const siblings = data.samples.edges.flatMap((edge) => {
          if (edge.node.__typename === "%other") return [];
          if (edge.node.id === coverNode.id) return [];
          const node = handleNode(edge.node);
          const nwa = node as unknown as { aspectRatio?: number };
          const sId = { description: (node as { id: string }).id };
          // Register sibling samples in the outer store so the
          // shared looker pipeline can resolve them at show time.
          store.set(sId, node as unknown as fos.Sample);
          return [
            {
              key: cursor,
              aspectRatio:
                nwa.aspectRatio && Number.isFinite(nwa.aspectRatio)
                  ? nwa.aspectRatio
                  : 1,
              id: sId,
              data: node as fos.Sample,
            },
          ];
        });
        const next = data.samples.pageInfo.hasNextPage ? cursor + 1 : null;
        // Pager exhausted (server reports no more pages) → row is
        // fully loaded, drop the shimmer.
        if (next === null) hideShimmer();
        return {
          items: siblings,
          next,
          previous: cursor > 1 ? cursor - 1 : null,
        };
      };

      // Inner renderer: spacer items render as grid-colored blanks;
      // everything else (cover + siblings) delegates to base.
      const innerRenderer = {
        showItem: ((args2) => {
          if (args2.id.description === spacerId) {
            args2.element.style.background =
              "var(--fo-palette-background-mediaSpace)";
            return Promise.resolve(0);
          }
          return base.renderer.showItem(args2);
        }) as typeof base.renderer.showItem,
        hideItem: ((args2) => {
          if (args2.id.description === spacerId) return undefined;
          return base.renderer.hideItem(args2);
        }) as typeof base.renderer.hideItem,
        detachItem: ((innerId) => {
          if (innerId.description === spacerId) return;
          base.renderer.detachItem(innerId);
        }) as typeof base.renderer.detachItem,
      };

      const innerSpotlight = new Spotlight<number, fos.Sample>({
        key: 0,
        offset: 0,
        horizontal: true,
        scrollbar: true,
        // Fill ON: cover paints from page 0 immediately, then
        // Spotlight asks for page 1 to fill the strip — that's the
        // single sibling request the user wanted to fire after the
        // cover landed.
        fill: true,
        spacing: 4,
        rowAspectRatioThreshold: () => 0,
        get: innerGet,
        ...innerRenderer,
      });
      innerSpotlights.current.set(key, innerSpotlight);
      // Shimmer removal is driven from `innerGet` when the pager
      // returns `next: null` (siblings exhausted). Spotlight's own
      // `load` event isn't reliable here — the inner's first
      // synchronous page would race the listener registration —
      // and `rowchange` would clear too aggressively (firing on
      // every scroll-induced row swap). Pager exhaustion is the
      // intent the user asked for.
      innerSpotlight.attach(row);

      // Wheel routing — vertical wheels escape to the outer grid;
      // horizontal wheels stay in the inner.
      const outerHost = document.getElementById(id);
      const handler = (e: WheelEvent) => {
        if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
          e.stopPropagation();
        } else {
          e.preventDefault();
          e.stopPropagation();
          (outerHost?.firstElementChild as HTMLElement | null)?.scrollBy(
            0,
            e.deltaY
          );
        }
      };
      row.addEventListener("wheel", handler, { passive: false });
      wheelHandlers.current.set(key, { element: row, handler });

      return Promise.resolve(0);
    },
    [
      base.renderer,
      ensureScaffold,
      environment,
      groupField,
      id,
      resolveSiblingPager,
      spacing,
      store,
    ]
  );

  const hideItem = useCallback<Hide>(() => undefined, []);

  const detachItem = useCallback((itemId: ID) => {
    const key = itemId.description;
    const innerSpotlight = innerSpotlights.current.get(key);
    if (innerSpotlight) {
      innerSpotlight.destroy();
      innerSpotlights.current.delete(key);
    }
    const binding = wheelHandlers.current.get(key);
    if (binding) {
      binding.element.removeEventListener("wheel", binding.handler);
      wheelHandlers.current.delete(key);
    }
  }, []);

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
