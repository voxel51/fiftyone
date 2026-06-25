import type { ID, ItemClick } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useRef } from "react";
import styles from "./Grid.module.css";
import type { CellBox } from "./useGridEngine";
import useGridEngine from "./useGridEngine";
import { type GridNode, type SampleStore } from "./useSpotlightPager";

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
  const {
    viewportRef,
    layout,
    vTop,
    moving,
    fast,
    idFor,
    cells,
    version,
    loadedOnce,
    topIndex,
    scrollbar,
    openSample,
  } = useGridEngine({
    reset,
    ensureSpineWindow,
    hydrateWindow,
    spineTotal,
    store,
    onItemClick,
  });

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
          version={version}
          moving={moving}
          idFor={idFor}
          attachItem={attachItem}
          releaseItem={releaseItem}
          onOpen={openSample}
        />
      ))}

      {!loadedOnce && <div className={styles.fallingPixels} />}

      {scrollbar.explored > 0 && (
        <div
          className={`${styles.virtualScrollbar}${
            scrollbar.indicate ? ` ${styles.visible}` : ""
          }`}
          onPointerDown={scrollbar.onThumbDown}
          onPointerMove={scrollbar.onThumbMove}
          onPointerUp={scrollbar.onThumbUp}
          style={{ top: scrollbar.thumbTop, height: scrollbar.thumbHeight }}
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
