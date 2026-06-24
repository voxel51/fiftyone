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
import { useSetRecoilState } from "recoil";
import styles from "./Grid.module.css";
import { gridSpineTotal } from "./recoil";
import useSpineLayout from "./useSpineLayout";
import {
  PAGE_SIZE,
  isPlaceholder,
  type GridNode,
  type SampleStore,
} from "./useSpotlightPager";
import useVirtualScroll from "./useVirtualScroll";

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

interface CellBox {
  index: number;
  id?: string;
  x: number;
  y: number; // virtual y (absolute, pre-vTop)
  width: number;
  height: number;
}

const Cell = ({
  cell,
  vTop,
  version,
  moving,
  idFor,
  attachItem,
  releaseItem,
  onOpen,
}: {
  cell: CellBox;
  vTop: number;
  // bumped on hydrate to re-run the attach effect
  version: number;
  // attaching loads media, so suppress it mid-fling
  moving: boolean;
  // sample id -> stable ID object (the looker store keys by identity)
  idFor: (id: string) => ID;
  // mount a cached looker onto this tile
  attachItem: (
    id: ID,
    element: HTMLElement,
    dimensions: [number, number]
  ) => void;
  // detach this tile's looker
  releaseItem: (id: ID) => void;
  onOpen?: (index: number, id: string, event: React.MouseEvent) => void;
}) => {
  const elRef = useRef<HTMLDivElement>(null);
  const { id, width, height } = cell;

  // meta/ctrl/shift are reserved for selection.
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!id || !onOpen) return;
      if (event.metaKey || event.shiftKey || event.ctrlKey) return;
      event.preventDefault();
      onOpen(cell.index, id, event);
    },
    [id, onOpen, cell.index]
  );

  // Idempotent and a no-op until the sample hydrates, so it retries on `version`.
  useEffect(() => {
    const el = elRef.current;
    // skip while flinging: attaching creates the looker, which loads media.
    if (!el || !id || !width || !height || moving) return;
    attachItem(idFor(id), el, [width, height]);
  }, [id, width, height, idFor, attachItem, version, moving]);

  // separate from the attach effect so a `version` re-attach never releases first (no flash).
  useEffect(() => {
    if (!id) return;
    const key = idFor(id);
    return () => releaseItem(key);
  }, [id, idFor, releaseItem]);

  return (
    <div
      ref={elRef}
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

export default function InfiniteGrid({
  id,
  reset,
  ensureSpineWindow,
  hydrateWindow,
  spineTotal,
  store,
  attachItem,
  releaseItem,
  onItemClick,
}: {
  id: string;
  // changes on view/filter reset; invalidates index-keyed caches
  reset: string;
  ensureSpineWindow: (
    start: number,
    count: number
  ) => Promise<fos.SpineEntry[]>;
  hydrateWindow: (ids: ReadonlyArray<string>) => Promise<Map<string, GridNode>>;
  // the view's item count once the spine reaches its end, else null
  spineTotal: () => number | null;
  store: SampleStore;
  // mount a cached looker onto a tile
  attachItem: (
    id: ID,
    element: HTMLElement,
    dimensions: [number, number]
  ) => void;
  // detach a tile's looker on recycle/unmount
  releaseItem: (id: ID) => void;
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

  // null until the spine reveals the view's end; clamps the layout to the real count.
  const revealedTotal = spineTotal();
  const layout = useSpineLayout(size.width, revealedTotal);

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

  // ref so accumulating entries never copies a growing map
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
    entriesRef.current = new Map();
    idObjs.current = new Map();
    maxReachedRef.current = 0;
    setLoadedOnce(false);
    setEntriesVersion((v) => v + 1);
  }, [reset]);

  // cells for the in-view index range; each carries its spine id.
  const cells = useMemo<CellBox[]>(() => {
    const out: CellBox[] = [];
    for (let index = range.start; index < range.end; index++) {
      const { x, y } = layout.posOf(index);
      out.push({
        index,
        id: entriesRef.current.get(index)?.id,
        x,
        y,
        width: layout.cellWidth,
        height: layout.rowHeight,
      });
    }
    return out;
    // entriesVersion participates so settle-loaded ids appear.
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
  const topIndex = layout.itemsPerRow
    ? Math.min(
        layout.totalCount,
        Math.ceil((vTop + size.height) / layout.rowStride) * layout.itemsPerRow
      )
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
          version={entriesVersion}
          moving={moving}
          idFor={idFor}
          attachItem={attachItem}
          releaseItem={releaseItem}
          onOpen={openSample}
        />
      ))}

      {!loadedOnce && <div className={styles.fallingPixels} />}

      {explored > 0 && (
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
          {topIndex.toLocaleString()} / {layout.totalCount.toLocaleString()}
        </div>
      )}
    </div>
  );
}
