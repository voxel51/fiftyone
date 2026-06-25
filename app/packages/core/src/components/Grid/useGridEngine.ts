import type { ID, ItemClick, ItemData } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import {
  gridAspectRatio,
  gridHeaderHeight,
  gridSpacing,
  gridSpineTotal,
  parseAspectRatio,
} from "./recoil";
import justifiedLayout, { type GridLayout } from "./justifiedLayout";
import useSpineLayout from "./useSpineLayout";
import {
  PAGE_SIZE,
  isPlaceholder,
  type GridNode,
  type SampleStore,
} from "./useSpotlightPager";
import useVirtualScroll from "./useVirtualScroll";
import { QP_WAIT, QueryPerformanceToastEvent } from "../QueryPerformanceToast";

// settle threshold in rows/sec — at or below this, the in-view window loads.
const SETTLE_ROWS_PER_SEC = 2;
// flick threshold in rows/sec — above this the depth readout grows.
const ACCEL_ROWS_PER_SEC = 8;
// extra rows above/below the viewport kept mounted for smoothness.
const OVERSCAN_ROWS = 3;
// pages prefetched ahead of the viewport, hydrated in the same query as the window.
const LOOKAHEAD_PAGES = 2;
// scroll indicators linger this long after motion stops.
const INDICATOR_FADE_MS = 900;
const THUMB_MIN_PX = 24;

export interface CellBox {
  index: number;
  id?: string;
  x: number;
  y: number; // virtual y (absolute, pre-vTop)
  width: number;
  height: number;
}

export interface GridScrollbar {
  explored: number;
  thumbTop: number;
  thumbHeight: number;
  indicate: boolean;
  onThumbDown: (e: React.PointerEvent) => void;
  onThumbMove: (e: React.PointerEvent) => void;
  onThumbUp: (e: React.PointerEvent) => void;
}

export interface GridEngine {
  viewportRef: React.RefObject<HTMLDivElement>;
  size: { width: number; height: number };
  layout: GridLayout;
  vTop: number;
  moving: boolean;
  fast: boolean;
  idFor: (sampleId: string) => ID;
  cells: CellBox[];
  // bumped when a hydrate lands; drives the tile attach effect to re-run
  version: number;
  loadedOnce: boolean;
  topIndex: number;
  scrollbar: GridScrollbar;
  openSample: (index: number, id: string, event: React.MouseEvent) => void;
}

/**
 * The infinite grid's engine: owns layout (uniform fixed-AR or justified
 * auto-AR), synthetic scroll, the settle-gated window load/prefetch, scroll
 * state, and modal navigation. The component consumes its outputs and renders
 * tiles — no orchestration there.
 */
export default function useGridEngine({
  reset,
  ensureSpineWindow,
  hydrateWindow,
  spineTotal,
  store,
  onItemClick,
}: {
  reset: string;
  ensureSpineWindow: (
    start: number,
    count: number
  ) => Promise<fos.SpineEntry[]>;
  hydrateWindow: (ids: ReadonlyArray<string>) => Promise<Map<string, GridNode>>;
  spineTotal: () => number | null;
  store: SampleStore;
  onItemClick?: ItemClick<number, fos.Sample>;
}): GridEngine {
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

  // measure before paint so the first frame already has wireframes.
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

  // ordered spine entries (id + optional aspect ratio), filled as windows load.
  // ref so accumulating never copies a growing map.
  const entriesRef = useRef(new Map<number, fos.SpineEntry>());
  const [entriesVersion, setEntriesVersion] = useState(0);
  // true once the first hydrate has landed — drives the initial loading animation.
  const [loadedOnce, setLoadedOnce] = useState(false);
  // ids whose hydrate is in flight, so overlapping loads never re-request.
  const inflight = useRef(new Set<string>());
  // greatest scroll depth reached — the scrollbar spans [0, maxReached], not the full height.
  const maxReachedRef = useRef(0);
  // previous settle's first visible index — its delta gives the scroll direction.
  const prevStartRef = useRef(0);

  // null until the spine reveals the view's end; clamps the layout to the real count.
  const revealedTotal = spineTotal();
  const uniform = useSpineLayout(size.width, revealedTotal);

  // justified (auto-AR) layout reads each item's AR from the spine; fixed AR uses the
  // uniform deterministic layout. Recomputes as ARs load (entriesVersion).
  const isAuto = parseAspectRatio(useRecoilValue(gridAspectRatio)) === null;
  const spacing = useRecoilValue(gridSpacing);
  const headerOffset = useRecoilValue(gridHeaderHeight);
  const justified = useMemo<GridLayout | null>(() => {
    if (!isAuto || !size.width || !uniform.totalCount) return null;
    return justifiedLayout({
      width: size.width,
      spacing,
      headerOffset,
      targetRowHeight: uniform.rowHeight,
      totalCount: uniform.totalCount,
      aspectRatioOf: (index) => entriesRef.current.get(index)?.aspectRatio,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuto,
    size.width,
    spacing,
    headerOffset,
    uniform.rowHeight,
    uniform.totalCount,
    entriesVersion,
  ]);
  const layout: GridLayout = justified ?? uniform;

  // publish the revealed count for ResourceCount; reset on unmount so no stale count.
  const setSpineTotalAtom = useSetRecoilState(gridSpineTotal);
  useEffect(() => {
    setSpineTotalAtom(revealedTotal);
  }, [revealedTotal, setSpineTotalAtom]);
  useEffect(() => () => setSpineTotalAtom(null), [setSpineTotalAtom]);

  const { vTop, moving, fast, scrollTo } = useVirtualScroll({
    elementRef: viewportRef,
    virtualHeight: layout.virtualHeight,
    viewportHeight: size.height,
    settleSpeed: layout.rowHeight * SETTLE_ROWS_PER_SEC,
    acceleratedSpeed: layout.rowHeight * ACCEL_ROWS_PER_SEC,
  });

  // justified layout needs every item's AR up front, so positions don't reflow as the
  // user scrolls. The AR spine is an id+ratio read, so eager-loading it is cheap.
  useEffect(() => {
    if (!isAuto) return undefined;
    let cancelled = false;
    void (async () => {
      let cursor = 0;
      for (;;) {
        const got = await ensureSpineWindow(cursor, PAGE_SIZE);
        if (cancelled || !got.length) break;
        let changed = false;
        got.forEach((e, i) => {
          const idx = cursor + i;
          if (!entriesRef.current.has(idx)) {
            entriesRef.current.set(idx, e);
            changed = true;
          }
        });
        if (changed) setEntriesVersion((v) => v + 1);
        if (got.length < PAGE_SIZE) break;
        cursor += got.length;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuto, ensureSpineWindow, reset]);

  // modal next/prev resolves neighbours by spine index and hydrates them so the
  // looker reader finds them
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

      // the looker reader throws if the clicked sample isn't in the store, so hydrate
      // it first when missing.
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
    [onItemClick, layout, ensureSpineWindow, hydrateWindow, store, idFor]
  );

  // the absolute index range currently in view (+ overscan).
  const range = useMemo(
    () =>
      size.height
        ? layout.indexRange(vTop, size.height, OVERSCAN_ROWS)
        : { start: 0, end: 0 },
    [vTop, size.height, layout]
  );

  // gated on settle so flinging never fetches
  useEffect(() => {
    if (moving || range.end <= range.start) return undefined;
    const ss = store as unknown as WeakMap<ID, GridNode>;

    // prefetch the look-ahead in the scroll direction: a lower start than the last
    // settle means scrolling up, so extend the window above the viewport, else below.
    const goingUp = range.start < prevStartRef.current;
    prevStartRef.current = range.start;

    const visStart = Math.floor(range.start / PAGE_SIZE) * PAGE_SIZE;
    const visEnd = Math.ceil(range.end / PAGE_SIZE) * PAGE_SIZE;
    const start = goingUp
      ? Math.max(0, visStart - LOOKAHEAD_PAGES * PAGE_SIZE)
      : visStart;
    const end = goingUp ? visEnd : visEnd + LOOKAHEAD_PAGES * PAGE_SIZE;

    const loadLabels = async (ids: string[]) => {
      const need = ids.filter(
        (id) => isPlaceholder(ss.get(idFor(id))) && !inflight.current.has(id)
      );
      if (!need.length) return;
      need.forEach((id) => inflight.current.add(id));
      try {
        const nodes = await hydrateWindow(need);
        for (const [sid, node] of nodes) ss.set(idFor(sid), node);
      } finally {
        need.forEach((id) => inflight.current.delete(id));
      }
      setLoadedOnce(true);
      setEntriesVersion((v) => v + 1);
    };

    void (async () => {
      const got = await ensureSpineWindow(start, end - start);
      if (!got.length) return;
      // publish ids first so positioned wireframes appear immediately.
      let changed = false;
      const visible: string[] = [];
      const ahead: string[] = [];
      got.forEach((e, i) => {
        const idx = start + i;
        if (!entriesRef.current.has(idx)) {
          entriesRef.current.set(idx, e);
          changed = true;
        }
        // viewport tiles hydrate first; the directional look-ahead follows.
        (idx >= visStart && idx < visEnd ? visible : ahead).push(e.id);
      });
      if (changed) setEntriesVersion((v) => v + 1);

      // one match-_id query per settle, covering the visible window + look-ahead.
      await loadLabels([...visible, ...ahead]);
    })();
    return undefined;
  }, [
    moving,
    range.start,
    range.end,
    ensureSpineWindow,
    hydrateWindow,
    store,
    idFor,
  ]);

  // a view/filter reset re-keys the spine; drop index-keyed caches. Guarded so it
  // only fires on an actual change, never on mount.
  const resetRef = useRef(reset);
  useEffect(() => {
    if (resetRef.current === reset) return;
    resetRef.current = reset;
    // a refresh tears the grid down then reloads; signal the teardown half here
    // and the reload half via grid-mount once content lands.
    document.dispatchEvent(new CustomEvent("grid-unmount"));
    entriesRef.current = new Map();
    idObjs.current = new Map();
    maxReachedRef.current = 0;
    setLoadedOnce(false);
    setEntriesVersion((v) => v + 1);
  }, [reset]);

  // grid lifecycle signals (parity with the retired engine): e2e refresh-waiting
  // and any listeners key off these. A fresh content load is a "mount"; teardown
  // (reset above / unmount) is an "unmount".
  useEffect(() => {
    if (loadedOnce) {
      document.dispatchEvent(new CustomEvent("grid-mount"));
    }
  }, [loadedOnce]);
  useEffect(
    () => () => {
      document.dispatchEvent(new CustomEvent("grid-unmount"));
    },
    []
  );

  // slow first load -> query-performance toast (parity with the retired engine),
  // re-armed each (re)load cycle and cleared the moment content arrives.
  useEffect(() => {
    if (loadedOnce) return undefined;
    const info = fos.getQueryPerformancePath();
    if (!info) return undefined;
    const timeout = setTimeout(
      () =>
        window.dispatchEvent(
          new QueryPerformanceToastEvent(info.path, info.isFrameField)
        ),
      QP_WAIT
    );
    return () => clearTimeout(timeout);
  }, [loadedOnce, reset]);

  // cells for the in-view index range; each carries its spine id + layout box.
  const cells = useMemo<CellBox[]>(() => {
    const out: CellBox[] = [];
    for (let index = range.start; index < range.end; index++) {
      const { x, y, width, height } = layout.cellOf(index);
      out.push({
        index,
        id: entriesRef.current.get(index)?.id,
        x,
        y,
        width,
        height,
      });
    }
    return out;
    // entriesVersion participates so settle-loaded ids appear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, layout, entriesVersion]);

  const [indicate, setIndicate] = useState(false);
  useEffect(() => {
    if (moving) {
      setIndicate(true);
      return undefined;
    }
    const t = setTimeout(() => setIndicate(false), INDICATOR_FADE_MS);
    return () => clearTimeout(t);
  }, [moving, vTop]);

  // thumb spans only the deepest point reached so far, not the full virtual height.
  maxReachedRef.current = Math.max(maxReachedRef.current, vTop);
  const explored = maxReachedRef.current;
  const exploredContent = explored + size.height;
  const thumbHeight =
    exploredContent > 0
      ? Math.max(THUMB_MIN_PX, (size.height / exploredContent) * size.height)
      : 0;
  const thumbTop =
    explored > 0 ? (vTop / explored) * (size.height - thumbHeight) : 0;
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
      const reached = maxReachedRef.current;
      // bound to explored territory — the thumb can't drag past the deepest point.
      scrollTo(
        Math.min(
          Math.max(drag.current.vTop + (dy / travel) * reached, 0),
          reached
        )
      );
    },
    [scrollTo, size.height, thumbHeight]
  );
  const onThumbUp = useCallback((e: React.PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // deepest item visible, clamped to the total, so the counter reaches the full count.
  const topIndex = layout.lastVisibleIndex(vTop, size.height);

  return {
    viewportRef,
    size,
    layout,
    vTop,
    moving,
    fast,
    idFor,
    cells,
    version: entriesVersion,
    loadedOnce,
    topIndex,
    scrollbar: {
      explored,
      thumbTop,
      thumbHeight,
      indicate,
      onThumbDown,
      onThumbMove,
      onThumbUp,
    },
    openSample,
  };
}
