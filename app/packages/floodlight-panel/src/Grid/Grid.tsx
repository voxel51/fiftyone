import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import clsx from "clsx";
import { freeVideos } from "@fiftyone/looker";
import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "@fiftyone/core/src/hooks";
import GridScrubber from "./GridScrubber";
import {
  gridAutosizing,
  gridSquareTiles,
  gridCrop,
  gridSpacing,
  gridZoom,
  maxGridItemsSizeBytes,
  pageParameters,
} from "./atoms";
import { createPageSource } from "../host/pageSource";
import { createOwnership, type Scoped, scopeRenderer } from "../host/ownership";
import useHost from "../host/useHost";
import useEscape from "./useEscape";
import useInstanceEvents from "./useInstanceEvents";
import useItemCache from "./useItemCache";
import useLabelVisibility from "./useLabelVisibility";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useScrollLocation from "./useScrollLocation";
import useSpotlightPager from "./useSpotlightPager";
import Storm from "./Storm";
import useSwimlaneRenderer from "./useSwimlaneRenderer";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";

const MAX_INSTANCES = 200;

const SHIMMER = {
  detachItem: () => {},
  hideItem: () => {},
  showItem: ({ element }: { element: HTMLDivElement }) => {
    element.classList.add(styles.tileShimmer);
    return Promise.resolve(0);
  },
};
const MAX_ROWS = 200;

function Grid({ layout }: { layout: "grid" | "groups" | "strip" }) {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useReverbValue(gridSpacing);

  const { pageReset, reset } = useRefreshers();
  const container = useRef<HTMLDivElement>(null);
  const zoom = useZoomSetting();

  useSyncLabelsRenderingStatus();

  const records = useRecords(pageReset);

  // divide by two, half for the hidden cache and half for max shown
  const maxBytes = useReverbValue(maxGridItemsSizeBytes) / 2;
  const cache = useItemCache({
    maxHiddenItems: MAX_INSTANCES,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    ...useLabelVisibility(),
  });

  // Swimlanes mode: the renderer wraps each Spotlight row in
  // `[ cover | divider | siblings ]` (see `useSwimlaneRenderer`), and
  // the row's aspect ratio is overridden uniformly so every row is
  // the same height regardless of the underlying image's native
  // ratio. The zoom slider repurposes as a row-height control —
  // `-1` (right of slider) ≈ square row, `-15` (left) ≈ very short.
  const useSwimlanes = layout === "groups";
  const strip = layout === "strip";
  const zoomValue = useReverbValue(gridZoom);
  const squareTiles = useReverbValue(gridSquareTiles);
  const swimlaneAspect = useSwimlanes
    ? Math.max(1, -(zoomValue ?? -3))
    : undefined;

  const { page, store } = useSpotlightPager({
    clearRecords: reset,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
    aspectRatioOverride: swimlaneAspect ?? (squareTiles ? 1 : undefined),
  });

  const standardRenderer = useRenderer({ cache, id, records, store });
  const swimlaneRenderer = useSwimlaneRenderer({
    cache,
    id,
    records,
    store,
  });
  const { getFontSize, lookerOptions } = useSwimlanes
    ? swimlaneRenderer
    : standardRenderer;
  const { get, set } = useScrollLocation(pageReset);

  const autosizing = useReverbValue(gridAutosizing);
  // When the scrubber is on it owns the grid's right edge; turn off
  // Spotlight's built-in scrollbar so the two don't fight for the gutter.
  const [scrubberEnabled] = fos.useGridScrubber();

  // `reset` is the grid's refresh signal. The callables below are routed
  // through a ref so their identities are not rebuild triggers — a transient
  // identity change from an unrelated state update must not destroy and
  // recreate the grid
  const renderers = {
    standard: standardRenderer.renderer,
    swimlane: swimlaneRenderer.renderer,
  };
  const refs = React.useRef({ get, page, renderers });
  refs.current = { get, page, renderers };

  // pages outlive instances, so a rebuild at a new size reads from memory
  const source = useMemo(() => createPageSource(page), [page]);
  const wire = useInstanceEvents();
  const ownership = useMemo(() => createOwnership(), [cache]);
  const interims = useRef(new WeakSet<object>());
  const cleanups = useRef(new WeakMap<object, () => void>());
  const scopes = useRef(new WeakMap<object, Scoped<number, fos.Sample>>());
  const lastSizes = useRef(new Map<string, [number, number]>());
  const hostRef = useRef<{ instance?: object }>();

  const { host, instance, status } = useHost<
    number,
    Spotlight<number, fos.Sample>
  >({
    ref: container,
    axis: strip ? "height" : "width",
    build: (anchor, { interim }) => {
      // Teardown must reach the renderer that created the items: swimlane
      // rows own inner instances that only its detachItem destroys.
      const kind = useSwimlanes ? "swimlane" : "standard";
      const sizes = lastSizes.current;
      const scoped = scopeRenderer<number, fos.Sample>(
        {
          detachItem: (item) => refs.current.renderers[kind].detachItem(item),
          hideItem: (item) => refs.current.renderers[kind].hideItem(item),
          showItem: (item) => {
            const key = item.id.description;
            if (interim) {
              // mid-resize, lookers move at their last size and stretch; the
              // rest shimmer, including swimlane rows, whose content is an instance
              const last = sizes.get(key);
              return last && kind === "standard" && cache.get(key)
                ? refs.current.renderers[kind].showItem({
                    ...item,
                    dimensions: last,
                  })
                : SHIMMER.showItem(item);
            }
            sizes.set(key, item.dimensions);
            return refs.current.renderers[kind].showItem(item);
          },
        },
        ownership,
      );
      // the visible instance keeps its lookers until the swap hands them over
      hostRef.current?.instance && scoped.defer();
      const next = new Spotlight<number, fos.Sample>({
        key: anchor?.key ?? 0,
        at: anchor?.at,

        ...scoped,

        maxRows: MAX_ROWS,
        maxItemsSizeBytes: autosizing && !interim ? maxBytes : undefined,
        scrollbar: strip || !scrubberEnabled,
        // Strip: one full-height item per column, scrolling left to right.
        horizontal: strip,
        ...(strip ? { offset: 0 } : {}),
        // swimlane rows abut so the view reads as one continuous stack
        spacing: useSwimlanes ? 0 : spacing,
        get: (key) => sourceRef.current.get(key),
        // swimlanes and strips place one item per row
        rowAspectRatioThreshold: useSwimlanes || strip ? () => 0 : zoom,
      });
      scopes.current.set(next, scoped);
      if (interim) interims.current.add(next);
      else cleanups.current.set(next, wire(next));
      return next;
    },
    onSwap: (next, previous) => {
      previous && scopes.current.get(previous)?.retire();
      cache.freeze();
      scopes.current.get(next)?.flush();
      cache.unfreeze();
    },
    onAnchor: (anchor) =>
      set({
        at: { description: anchor.at?.description ?? "" },
        fraction: anchor.at?.fraction ?? 0,
        page: anchor.key,
      }),
    onDispose: (disposed) => {
      cleanups.current.get(disposed)?.();
      freeVideos();
    },
  });
  const sourceRef = useRef(source);
  sourceRef.current = source;
  hostRef.current = host;

  // a setting that changes layout means a new instance, at the saved location
  const settings = useMemo(
    () => ({
      autosizing,
      maxBytes,
      reset,
      scrubberEnabled,
      spacing,
      squareTiles,
      strip,
      useSwimlanes,
      zoom,
    }),
    [
      autosizing,
      maxBytes,
      reset,
      scrubberEnabled,
      spacing,
      squareTiles,
      strip,
      useSwimlanes,
      zoom,
    ],
  );
  useEffect(() => {
    host?.rebuild(get());
  }, [get, host, settings]);

  // the storm covers first loads, real fetches during a rebuild, and scrubs
  const fetching = useSyncExternalStore(
    source.subscribe,
    () => source.fetching,
  );
  const loaded = useRef(false);
  if (status === "ready") loaded.current = true;
  const scrubbing = useReverbValue(fos.gridScrubbing);
  const storm =
    !loaded.current ||
    (status === "building" &&
      fetching &&
      !(instance && interims.current.has(instance))) ||
    scrubbing;

  useEscape();
  useUpdates({
    cache,
    getFontSize,
    options: lookerOptions,
    spotlight: instance,
  });

  return (
    <div className={styles.gridContainer}>
      <div
        id={id}
        ref={container}
        className={clsx(styles.spotlightGrid, strip && styles.strip)}
        data-cy="fo-grid"
      />
      <div
        id={pixels}
        className={clsx(styles.fallingPixels, !storm && styles.hidden)}
      >
        <Storm className={styles.storm} />
      </div>
      {!strip && <GridScrubber />}
    </div>
  );
}

export default React.memo(Grid);
