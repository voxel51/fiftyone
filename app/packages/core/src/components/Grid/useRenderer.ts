import type { Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useGridSelection } from "@fiftyone/state/src/selection";
import { useCallback, useMemo, useRef } from "react";
import { registerTile, unregisterTile } from "./gridTileRegistry";
import type { TileDecoratorSample } from "./tileDecorators";
import type { LookerCache } from "./types";
import useFontSize from "./useFontSize";
import { useGridCustomRendererItem } from "./useGridCustomRendererItem";
import useSelectSample from "./useSelectSample";
import type { GridSelectionClick } from "./useGridSelectionClick";
import { useTileIntervalOverlay } from "./useTileIntervalOverlay";
import type { SampleStore } from "./useSpotlightPager";

const LOOKER_HOST_ATTR = "data-fo-looker-host";
const OVERLAY_HOST_ATTR = "data-fo-tile-overlay";

const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  inset: "0",
  // Decorators on this layer shouldn't block looker pointer events
  // (click-to-open-modal, drag-to-select, etc.). Individual decorators
  // can re-enable on their own root element if they need interactivity.
  pointerEvents: "none",
  // Above the looker but below the GridCustomRendererWrapper buttons
  // (which use z-index 20).
  zIndex: "15",
};

const INNER_HOST_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  inset: "0",
};

/**
 * Wrap a Spotlight tile element so the looker has its own host (which
 * it's free to `replaceChildren` on attach) and the decorators have a
 * separate, undisturbed overlay sibling.
 *
 * Returns the inner host the looker should attach to.
 */
const ensureTileWrapping = (
  element: HTMLElement,
): { innerHost: HTMLElement; overlayHost: HTMLElement } => {
  let innerHost = element.querySelector<HTMLElement>(`[${LOOKER_HOST_ATTR}]`);
  if (!innerHost) {
    innerHost = document.createElement("div");
    innerHost.setAttribute(LOOKER_HOST_ATTR, "");
    Object.assign(innerHost.style, INNER_HOST_STYLE);
    element.appendChild(innerHost);
  }

  let overlayHost = element.querySelector<HTMLElement>(
    `[${OVERLAY_HOST_ATTR}]`,
  );
  if (!overlayHost) {
    overlayHost = document.createElement("div");
    overlayHost.setAttribute(OVERLAY_HOST_ATTR, "");
    Object.assign(overlayHost.style, OVERLAY_STYLE);
    element.appendChild(overlayHost);
  }

  return { innerHost, overlayHost };
};

/** Extract a stable sample-id from whatever payload `store.get` returned. */
const sampleIdFromResult = (result: unknown): string | null => {
  const r = result as { sample?: Record<string, unknown> } & Record<
    string,
    unknown
  >;
  const inner = r?.sample as Record<string, unknown> | undefined;
  const candidate =
    (inner?._id as string | undefined) ??
    (inner?.id as string | undefined) ??
    (r?._id as string | undefined) ??
    (r?.id as string | undefined);
  return typeof candidate === "string" ? candidate : null;
};

export default function useRenderer({
  cache,
  id,
  records,
  store,
  selectBucket,
}: {
  cache: LookerCache;
  id: string;
  records: Map<string, number>;
  store: SampleStore;
  selectBucket: GridSelectionClick;
}) {
  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getFontSize = useFontSize(id);
  const selectSample = useSelectSample(records, selectBucket);
  const selection = useGridSelection();
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const sampleRenderer = useGridCustomRendererItem(createLooker);
  const tileOverlay = useTileIntervalOverlay();

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const sampleRendererRef = useRef(sampleRenderer);
  sampleRendererRef.current = sampleRenderer;

  const detachItem = useCallback(
    (id: ID) => {
      tileOverlay.unmount(id.description);
      unregisterTile(id.description);
      return cache.get(id.description)?.detach();
    },
    [cache, tileOverlay],
  );

  const hideItem = useCallback<Hide>(
    ({ id }) => {
      tileOverlay.unmount(id.description);
      // Drop the decorator portal too — Spotlight may reuse this tile
      // element for a different sample on re-show, and we don't want
      // the old decorator pointing at an overlay div that now belongs
      // to someone else. The next `showItem` re-registers cheaply.
      unregisterTile(id.description);
      return cache.hide(id.description);
    },
    [cache, tileOverlay],
  );

  const showItem = useCallback<Show<number, fos.Sample>>(
    ({ id, element, dimensions, spotlight, zooming }) => {
      const key = id.description;

      // Wrap the tile element so the looker has a host of its own (which
      // it's free to `replaceChildren` on attach) and decorators have a
      // separate overlay sibling. Idempotent — re-showing an already-
      // wrapped tile just finds the existing children.
      const { innerHost, overlayHost } = ensureTileWrapping(element);

      const registerWithSample = (sample: unknown) => {
        const sampleId = sampleIdFromResult(sample) ?? key;
        // Pull the inner sample doc when wrapped (most sample-renderer
        // payloads look like `{ sample: {...}, urls: ... }`); decorators
        // should be free to read either shape.
        const decoratorSample =
          (sample as { sample?: TileDecoratorSample })?.sample ??
          (sample as TileDecoratorSample) ??
          {};
        registerTile({
          id: key,
          overlayEl: overlayHost,
          sample: decoratorSample,
        });
        return sampleId;
      };

      if (cache.isShown(key)) {
        return cache.sizeOf(key);
      }

      const instance = cache.get(key);
      if (instance) {
        instance.attach(innerHost, dimensions, getFontSize());
        cache.show(key);
        // Re-register so the overlay div (potentially recreated on a
        // fresh tile element after scroll) is what portals target.
        const cachedResult = store.get(id);
        if (cachedResult) {
          registerWithSample(cachedResult);
          tileOverlay.mount(key, element, cachedResult);
        }
        return cache.sizeOf(key);
      }

      if (zooming) {
        // we are scrolling fast, skip creation
        return Promise.resolve(0);
      }

      const result = store.get(id);

      if (!result) {
        throw new Error(
          `Failed to retrieve sample from store: ${id.description}`,
        );
      }

      const item = sampleRendererRef.current.createItem(
        result,
        id,
        getFontSize(),
      );
      if (selectionRef.current.enabled)
        item.updateOptions({
          selected: selectionRef.current.membership.has(key),
        });

      item.addEventListener("selectthumbnail", ({ detail }) =>
        selectSample.current?.(detail),
      );
      item.addEventListener("refresh", () => {
        if (cache.isShown(key)) {
          spotlight.sizeChange(key, item.getSizeBytesEstimate());
        } else {
          cache.updateSize(key);
        }
      });

      cache.set(key, item);
      item.attach(innerHost, dimensions);
      registerWithSample(result);
      tileOverlay.mount(key, element, result);
      return cache.sizeOf(key);
    },
    [cache, getFontSize, selectSample, sampleRendererRef, store, tileOverlay],
  );

  return {
    getFontSize,
    lookerOptions,
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
