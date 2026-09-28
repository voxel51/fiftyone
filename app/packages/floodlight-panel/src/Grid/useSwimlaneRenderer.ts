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
import Spotlight from "@fiftyone/floodlight";
import type { Get, Hide, ID, Show } from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { useRelayEnvironment } from "react-relay";
import type { VariablesOf } from "react-relay";
import { useReverbCallback, useReverbValue } from "@fiftyone/reverb";
import styles from "./Grid.module.css";
import { gridSpacing, groupSiblingsPageParameters } from "./atoms";
import { createPageSource } from "../host/pageSource";
import { SLOT } from "../host/createHost";
import { createOwnership, scopeRenderer } from "../host/ownership";
import { connectionItems, fetchSamplePage, routeWheel } from "./samplePages";
import type { ItemCache } from "./types";
import useRenderer from "./useRenderer";
import useSwimlaneResize, { groupIdOf } from "./useSwimlaneResize";
import type { SampleStore } from "./useSpotlightPager";

const SIBLINGS_PAGE_SIZE = 20;

export default function useSwimlaneRenderer({
  cache,
  id,
  records,
  store,
}: {
  cache: ItemCache;
  id: string;
  records: Map<string, number>;
  store: SampleStore;
}) {
  const base = useRenderer({ cache, id, records, store });
  const environment = useRelayEnvironment();
  const groupField = useReverbValue(fos.groupField);
  const spacing = useReverbValue(gridSpacing);

  // Per-row inner Spotlight + wheel handler, keyed by the cover
  // sample id. Outer Spotlight reuses row elements; we create the
  // inner once and destroy it only when the outer detaches.
  const innerSpotlights = useRef(
    new Map<string, Spotlight<number, fos.Sample>>(),
  );
  const wheelHandlers = useRef(new Map<string, () => void>());
  // the row element each inner instance is attached to
  const innerRows = useRef(new Map<string, HTMLElement>());
  const { bind, heights, rowAspects, scaffold } = useSwimlaneResize(groupField);

  // separate from the grid's: outer rows and inner strips both key by the cover id
  const ownership = useMemo(() => createOwnership(), [store]);
  // keyed by the exact query, so a view change misses instead of serving stale siblings
  const siblingPages = useMemo(
    () =>
      createPageSource(async (json: string) => {
        const connection = await fetchSamplePage(
          environment,
          JSON.parse(json) as VariablesOf<foq.paginateSamplesQuery>,
        );
        if (!connection) throw new Error("sibling page timed out");
        return connection;
      }),
    [environment, store],
  );

  const resolveSiblingPager = useReverbCallback(
    ({ snapshot }) =>
      async (groupId: string) =>
        snapshot.getPromise(groupSiblingsPageParameters(groupId)),
    [],
  );

  const detachInner = useCallback((key: string) => {
    innerSpotlights.current.get(key)?.destroy();
    innerSpotlights.current.delete(key);
    innerRows.current.delete(key);
    wheelHandlers.current.get(key)?.();
    wheelHandlers.current.delete(key);
  }, []);

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

      const [, rowHeight] = dimensions;
      const groupId = groupIdOf(coverNode, groupField);
      scaffold(element);
      bind(element, groupId, rowHeight);

      // a rebuilt outer instance shows the row in a new element, at its new height
      if (innerRows.current.get(key) === row) return Promise.resolve(0);
      detachInner(key);

      // Cover sample data is in the outer store; pull its aspect
      // ratio so the cover renders at native size in the inner
      // Spotlight's first row.
      const coverAspect =
        ((coverNode as unknown as { aspectRatio?: number }).aspectRatio &&
        Number.isFinite(
          (coverNode as unknown as { aspectRatio?: number }).aspectRatio,
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
        const variables = factory(cursor - 1, SIBLINGS_PAGE_SIZE);
        const connection = await siblingPages
          .get(JSON.stringify(variables))
          .catch(() => null);
        if (!connection) {
          // Connection didn't resolve (timeout / unknown). Pager
          // exhausted — clear the shimmer so we don't loop forever.
          hideShimmer();
          return { items: [], next: null, previous: null };
        }
        const siblings = connectionItems(connection, cursor, store, {
          skip: coverNode.id,
        });
        const next = connection.pageInfo.hasNextPage ? cursor + 1 : null;
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
      const scoped = scopeRenderer(base.renderer, ownership);
      const innerRenderer = {
        showItem: ((args2) => {
          if (args2.id.description === spacerId) {
            args2.element.style.background =
              "var(--fo-palette-background-mediaSpace)";
            return Promise.resolve(0);
          }
          return scoped.showItem(args2);
        }) as typeof base.renderer.showItem,
        hideItem: ((args2) => {
          if (args2.id.description === spacerId) return undefined;
          return scoped.hideItem(args2);
        }) as typeof base.renderer.hideItem,
        detachItem: ((innerId) => {
          if (innerId.description === spacerId) return;
          scoped.detachItem(innerId);
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
      innerRows.current.set(key, row);
      // Shimmer removal is driven from `innerGet` when the pager
      // returns `next: null` (siblings exhausted). Spotlight's own
      // `load` event isn't reliable here — the inner's first
      // synchronous page would race the listener registration —
      // and `rowchange` would clear too aggressively (firing on
      // every scroll-induced row swap). Pager exhaustion is the
      // intent the user asked for.
      innerSpotlight.attach(row);

      const outerHost = document.getElementById(id);
      wheelHandlers.current.set(
        key,
        routeWheel(row, () =>
          outerHost?.querySelector(`:scope > [${SLOT}="active"] > *`),
        ),
      );

      return Promise.resolve(0);
    },
    [
      base.renderer,
      bind,
      detachInner,
      ensureScaffold,
      environment,
      groupField,
      id,
      resolveSiblingPager,
      siblingPages,
      ownership,
      scaffold,
      spacing,
      store,
    ],
  );

  const hideItem = useCallback<Hide>(() => undefined, []);

  const detachItem = useCallback(
    (itemId: ID) => detachInner(itemId.description),
    [detachInner],
  );

  return {
    heights,
    rowAspects,
    getFontSize: base.getFontSize,
    lookerOptions: base.lookerOptions,
    renderer: useMemo(
      () => ({
        detachItem,
        hideItem,
        showItem,
      }),
      [detachItem, hideItem, showItem],
    ),
  };
}
