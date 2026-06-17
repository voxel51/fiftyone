import type { Hide, ID, ItemClick, ItemData, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./Grid.module.css";
import useSpineLayout from "./useSpineLayout";
import {
  PAGE_SIZE,
  type GridNode,
  type SampleStore,
  type SpineEntry,
} from "./useSpotlightPager";
import useVirtualScroll from "./useVirtualScroll";

// settle threshold in rows/sec — at or below this, the in-view window loads.
const SETTLE_ROWS_PER_SEC = 2;
// accelerated (flick) threshold in rows/sec — above this the depth readout grows;
// slow/small scrolls keep the small bottom badge (no distracting size change).
const ACCEL_ROWS_PER_SEC = 8;
// extra rows above/below the viewport kept mounted for smoothness.
const OVERSCAN_ROWS = 2;
// scroll indicators linger this long after motion stops.
const INDICATOR_FADE_MS = 900;
const THUMB_MIN_PX = 24;
// the in-view window must stay settled this long (a proxy for "in-view loaded")
// before any prefetch runs — so slowing/re-flicking never prefetches until the
// page has settled and the visible samples have loaded.
const PREFETCH_DELAY_MS = 500;
// warm this many pages ahead of / behind the in-view page once settled.
const PREFETCH_AFTER = 2;
const PREFETCH_BEFORE = 1;

// showItem only needs `spotlight.sizeChange`; the virtual grid has no engine, and
// the memory mechanism that consumed it is gone, so a no-op satisfies the type.
const SPOTLIGHT_STUB = {
  sizeChange: () => undefined,
} as unknown as Parameters<Show<number, fos.Sample>>[0]["spotlight"];

interface CellBox {
  index: number;
  id?: string;
  x: number;
  y: number; // virtual y (absolute, pre-vTop)
  width: number;
  height: number;
}

/** One grid cell: a visible wireframe while scrolling; on settle attaches its looker. */
const Cell = ({
  cell,
  vTop,
  moving,
  idFor,
  showItem,
  hideItem,
  onOpen,
}: {
  cell: CellBox;
  vTop: number;
  moving: boolean;
  idFor: (id: string) => ID;
  showItem: Show<number, fos.Sample>;
  hideItem: Hide;
  onOpen?: (index: number, id: string, event: React.MouseEvent) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { id, width, height } = cell;

  // A plain click opens the modal (meta/ctrl/shift are reserved for selection,
  // matching the spotlight grid). The looker is attached into this element and
  // does not stop click propagation, so a click on the tile bubbles here.
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!id || !onOpen) return;
      if (event.metaKey || event.shiftKey || event.ctrlKey) return;
      event.preventDefault();
      onOpen(cell.index, id, event);
    },
    [id, onOpen, cell.index]
  );

  // attach (build/hydrate or re-attach from cache) once settled and the id is known.
  useEffect(() => {
    const el = ref.current;
    if (moving || !id || !el) return;
    void showItem({
      id: idFor(id),
      element: el,
      dimensions: [width, height] as [number, number],
      spotlight: SPOTLIGHT_STUB,
      zooming: false,
    });
  }, [id, moving, width, height, idFor, showItem]);

  // leaving the window hides (cache retains the looker) — never destroyed here.
  useEffect(
    () => () => {
      id && hideItem({ id: idFor(id) });
    },
    [id, idFor, hideItem]
  );

  return (
    <div
      ref={ref}
      className={styles.spotlightWireframe}
      onClick={onOpen ? handleClick : undefined}
      style={{
        position: "absolute",
        top: 0,
        left: cell.x,
        width,
        height,
        cursor: id && onOpen ? "pointer" : undefined,
        transform: `translateY(${cell.y - vTop}px)`,
      }}
    />
  );
};

/**
 * Virtualized infinite-scroll grid: a synthetic virtual scroll lays out
 * deterministic rows from the cached spine; only in-view rows are mounted;
 * wireframe cells track motion instantly; media loads only when the scroll
 * settles (<= ~rows/sec). A virtual scrollbar thumb + depth readout show
 * position without a full-content DOM.
 */
export default function InfiniteGrid({
  id,
  reset,
  ensureSpineWindow,
  hydrateWindow,
  store,
  showItem,
  hideItem,
  onItemClick,
}: {
  id: string;
  /** changes when the view/filter resets — invalidates index-keyed caches. */
  reset: string;
  ensureSpineWindow: (start: number, count: number) => Promise<SpineEntry[]>;
  hydrateWindow: (ids: ReadonlyArray<string>) => Promise<Map<string, GridNode>>;
  store: SampleStore;
  showItem: Show<number, fos.Sample>;
  hideItem: Hide;
  /** opens the modal for a clicked tile (the spotlight grid's onItemClick). */
  onItemClick?: ItemClick<number, fos.Sample>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // stable ID objects per sample id (the looker store is keyed by object identity).
  const idObjs = useRef(new Map<string, ID>());
  const idFor = useMemo(
    () => (sampleId: string) => {
      let obj = idObjs.current.get(sampleId);
      if (!obj) {
        obj = { description: sampleId };
        idObjs.current.set(sampleId, obj);
      }
      return obj;
    },
    []
  );

  // measure SYNCHRONOUSLY before paint (so the first frame already has wireframes,
  // not a black screen), then keep it current with a ResizeObserver.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s.width === r.width && s.height === r.height
          ? s
          : { width: r.width, height: r.height }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useSpineLayout(size.width);
  const { vTop, moving, fast, scrollTo } = useVirtualScroll({
    elementRef: viewportRef,
    virtualHeight: layout.virtualHeight,
    viewportHeight: size.height,
    settleSpeed: layout.rowHeight * SETTLE_ROWS_PER_SEC,
    acceleratedSpeed: layout.rowHeight * ACCEL_ROWS_PER_SEC,
  });

  // Open the modal for a clicked tile. The infinite grid has no spotlight
  // engine, so modal next/previous navigation rides a spine-index cursor: each
  // step resolves the neighbouring index from the spine and hydrates it into the
  // looker store (so `useExpandSample`'s reader finds it). The clicked sample is
  // hydrated first for the same reason — otherwise the modal silently never
  // opens (its query is keyed off the modal selector this sets).
  const openSample = useCallback(
    (index: number, sampleId: string, event: React.MouseEvent) => {
      if (!onItemClick) {
        console.error(
          "[infinite-grid] tile clicked but no onItemClick wired; modal cannot open"
        );
        return;
      }
      const total = layout.totalCount;
      const ss = store as unknown as WeakMap<ID, GridNode>;
      const nativeEvent = event.nativeEvent;
      let pos = index;

      const iter = {
        next: async (offset: number, soft?: boolean) => {
          const target = pos + offset;
          if (target < 0 || (total > 0 && target >= total)) return undefined;
          try {
            const [entry] = await ensureSpineWindow(target, 1);
            if (!entry) return undefined;
            const obj = idFor(entry.id);
            if (!soft) {
              pos = target;
              if (!ss.has(obj)) {
                const node = (await hydrateWindow([entry.id])).get(entry.id);
                if (node) ss.set(obj, node);
              }
            }
            return obj;
          } catch (e) {
            console.error(
              "[infinite-grid] modal navigation failed at index",
              target,
              e
            );
            return undefined;
          }
        },
      };

      const obj = idFor(sampleId);
      const fire = () => {
        try {
          console.debug(
            "[infinite-grid] opening modal for sample",
            sampleId,
            "at index",
            index
          );
          onItemClick({
            event: nativeEvent,
            item: { id: obj } as unknown as ItemData<number, fos.Sample>,
            iter,
          });
        } catch (e) {
          console.error(
            "[infinite-grid] failed to open modal for sample",
            sampleId,
            e
          );
        }
      };

      // The looker reader throws if the clicked sample isn't in the store, so
      // hydrate it first when missing rather than fail the open.
      if (ss.has(obj)) {
        fire();
      } else {
        void hydrateWindow([sampleId])
          .then((nodes) => {
            const node = nodes.get(sampleId);
            if (node) ss.set(obj, node);
            else
              console.error(
                "[infinite-grid] could not hydrate clicked sample",
                sampleId,
                "- opening anyway"
              );
            fire();
          })
          .catch((e) =>
            console.error(
              "[infinite-grid] hydrate failed for clicked sample",
              sampleId,
              e
            )
          );
      }
    },
    [
      onItemClick,
      layout.totalCount,
      ensureSpineWindow,
      hydrateWindow,
      store,
      idFor,
    ]
  );

  // the absolute index range currently in view (+ overscan).
  const range = useMemo(
    () =>
      size.height
        ? layout.indexRange(vTop, size.height, OVERSCAN_ROWS)
        : { start: 0, end: 0 },
    [vTop, size.height, layout]
  );

  // spine entries by index, in a ref so accumulating them never copies a growing
  // map per frame; a version bump re-renders only when NEW entries land.
  const entriesRef = useRef(new Map<number, SpineEntry>());
  const [entriesVersion, setEntriesVersion] = useState(0);

  // fetch the in-view window ONLY when settled (never mid-fling); page-aligned and
  // fetched DIRECTLY (no prior pages). Slow scroll keeps `moving` false → loads
  // progressively as the window moves.
  useEffect(() => {
    if (moving || range.end <= range.start) return undefined;
    let cancelled = false;
    const start = Math.floor(range.start / PAGE_SIZE) * PAGE_SIZE;
    const end = Math.ceil(range.end / PAGE_SIZE) * PAGE_SIZE;
    void ensureSpineWindow(start, end - start).then((got) => {
      if (cancelled) return;
      let changed = false;
      got.forEach((e, i) => {
        if (!entriesRef.current.has(start + i)) {
          entriesRef.current.set(start + i, e);
          changed = true;
        }
      });
      if (changed) setEntriesVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [moving, range.start, range.end, ensureSpineWindow]);

  // --- Tier 2: prefetch buffer ---
  const currentPage =
    layout.itemsPerRow > 0 && layout.rowStride > 0
      ? Math.floor(
          (Math.floor(vTop / layout.rowStride) * layout.itemsPerRow) / PAGE_SIZE
        )
      : 0;
  const totalPages = Math.max(1, Math.ceil(layout.totalCount / PAGE_SIZE));

  // Prefetch is allowed only after we've stayed settled (not moving) for
  // PREFETCH_DELAY_MS — a proxy for "the in-view window has loaded". Any motion
  // (a flick / re-flick) resets it, so prefetch never competes with the in-view
  // load and never fires while still scrolling.
  const [prefetchReady, setPrefetchReady] = useState(false);
  useEffect(() => {
    if (moving) {
      setPrefetchReady(false);
      return undefined;
    }
    const t = setTimeout(() => setPrefetchReady(true), PREFETCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [moving]);

  // Warm the pages around the in-view page (spine + media url + image bytes)
  // WITHOUT mounting lookers, so slow scrolling reveals already-loaded rows.
  // Re-runs as `currentPage` advances → the next page warms after ~1 page
  // scrolled. Forward-priority (+1, +2, then −1).
  const prefetched = useRef(new Set<number>());
  useEffect(() => {
    if (!prefetchReady || moving) return undefined;
    let cancelled = false;
    const pages: number[] = [];
    for (let d = 1; d <= PREFETCH_AFTER; d++) pages.push(currentPage + d);
    for (let d = 1; d <= PREFETCH_BEFORE; d++) pages.push(currentPage - d);
    const ss = store as unknown as WeakMap<ID, GridNode>;
    void (async () => {
      for (const p of pages) {
        if (cancelled) return;
        if (p < 0 || p >= totalPages || prefetched.current.has(p)) continue;
        prefetched.current.add(p);
        const entries = await ensureSpineWindow(p * PAGE_SIZE, PAGE_SIZE);
        if (cancelled || !entries.length) continue;
        const nodes = await hydrateWindow(entries.map((e) => e.id));
        if (cancelled) return;
        for (const [sid, node] of nodes) {
          ss.set(idFor(sid), node);
          // warm image bytes (images only — a video url is the clip, not a poster).
          const mt = (node.sample as { _media_type?: string } | undefined)
            ?._media_type;
          if (mt !== "video") {
            node.urls?.forEach((u) => {
              const img = new Image();
              img.src = u.url;
            });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    prefetchReady,
    moving,
    currentPage,
    totalPages,
    ensureSpineWindow,
    hydrateWindow,
    store,
    idFor,
  ]);

  // a view/filter reset re-keys the spine; drop the index-keyed caches so stale
  // (index → sample) mappings never paint after the underlying set changes. Guarded
  // so it only fires on an ACTUAL change — never on mount (which would wipe the
  // initial in-view load before it paints).
  const resetRef = useRef(reset);
  useEffect(() => {
    if (resetRef.current === reset) return;
    resetRef.current = reset;
    entriesRef.current = new Map();
    prefetched.current = new Set();
    idObjs.current = new Map();
    setEntriesVersion((v) => v + 1);
  }, [reset]);

  // cells for the in-view index range — wireframe while moving (no id), filled on settle.
  const cells = useMemo<CellBox[]>(() => {
    const out: CellBox[] = [];
    for (let index = range.start; index < range.end; index++) {
      const { x, y } = layout.posOf(index);
      out.push({
        index,
        id: moving ? undefined : entriesRef.current.get(index)?.id,
        x,
        y,
        width: layout.cellWidth,
        height: layout.rowHeight,
      });
    }
    return out;
    // entriesVersion participates so settle-loaded ids appear.
  }, [range, layout, moving, entriesVersion]);

  // indicator visibility: on while scrolling, fading shortly after it stops.
  const [indicate, setIndicate] = useState(false);
  useEffect(() => {
    if (moving) {
      setIndicate(true);
      return undefined;
    }
    const t = setTimeout(() => setIndicate(false), INDICATOR_FADE_MS);
    return () => clearTimeout(t);
  }, [moving, vTop]);

  // virtual scrollbar thumb geometry + drag-to-scroll.
  const max = Math.max(0, layout.virtualHeight - size.height);
  const thumbHeight =
    layout.virtualHeight > 0
      ? Math.max(
          THUMB_MIN_PX,
          (size.height / layout.virtualHeight) * size.height
        )
      : 0;
  const thumbTop = max > 0 ? (vTop / max) * (size.height - thumbHeight) : 0;
  const drag = useRef<{ y: number; vTop: number } | null>(null);
  const onThumbDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { y: e.clientY, vTop };
    },
    [vTop]
  );
  const onThumbMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const travel = size.height - thumbHeight;
      if (travel <= 0) return;
      const dy = e.clientY - drag.current.y;
      scrollTo(drag.current.vTop + (dy / travel) * max);
    },
    [scrollTo, size.height, thumbHeight, max]
  );
  const onThumbUp = useCallback((e: React.PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const topIndex = layout.itemsPerRow
    ? Math.floor(vTop / layout.rowStride) * layout.itemsPerRow
    : 0;

  return (
    <div
      ref={viewportRef}
      id={id}
      className={styles.spotlightGrid}
      data-cy="fo-grid"
      tabIndex={0}
      style={{ overflow: "hidden", outline: "none" }}
    >
      {cells.map((cell) => (
        <Cell
          key={cell.index}
          cell={cell}
          vTop={vTop}
          moving={moving}
          idFor={idFor}
          showItem={showItem}
          hideItem={hideItem}
          onOpen={openSample}
        />
      ))}

      {max > 0 && (
        <div
          className={`${styles.virtualScrollbar}${
            indicate ? ` ${styles.visible}` : ""
          }`}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          style={{ top: thumbTop, height: thumbHeight }}
        />
      )}

      {layout.totalCount > 0 && (
        <div
          className={`${styles.scrollIndicator} ${styles.visible}${
            fast ? ` ${styles.scrolling}` : ""
          }`}
        >
          {(topIndex + 1).toLocaleString()} /{" "}
          {layout.totalCount.toLocaleString()}
        </div>
      )}
    </div>
  );
}
