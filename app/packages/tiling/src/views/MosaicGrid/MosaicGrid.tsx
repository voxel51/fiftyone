import clsx from "clsx";
import React, { useRef, useState } from "react";
import {
  Mosaic,
  MosaicBranch,
  MosaicNode,
  MosaicWindow,
  createExpandUpdate,
  createRemoveUpdate,
  updateTree,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";
import { TileIdScope } from "../../lib/TilingProvider";
import { TileHeader } from "../Tile/Tile";
import styles from "./MosaicGrid.module.css";

/**
 * Per-tile config. `title` shows in the draggable toolbar (the toolbar IS
 * react-mosaic's drag source). `render` returns the body content only —
 * the tile chrome is provided by the grid's toolbar.
 */
export interface MosaicTileConfig {
  title: string;
  render: () => React.ReactNode;
}

export interface MosaicGridProps {
  /** Map of tile id → render config. The id is the key used in the layout tree. */
  tiles: Record<string, MosaicTileConfig>;
  /** Current layout tree. `null` renders the empty state. */
  value: MosaicNode<string> | null;
  /** Called when the user drags, resizes, or closes a window. */
  onChange: (node: MosaicNode<string> | null) => void;
  /**
   * Id of the currently focused tile. Receives a visual focused indicator
   * and is also the tile the host should target when spawning new windows
   * (`addTileToLayout(layout, newId, focusedTileId)`).
   */
  focusedTileId?: string | null;
  /** Called when the user clicks a tile's header or body. */
  onFocusTile?: (id: string) => void;
  className?: string;
}

/**
 * Draggable, resizable grid layout wrapping `react-mosaic-component`.
 *
 * Each tile's `TileHeader` becomes the mosaic toolbar — react-mosaic
 * auto-wires the toolbar as the drag source, so dragging the header
 * moves the window. The body content (from `tile.render`) is everything
 * below the toolbar.
 *
 * Fullscreen uses `createExpandUpdate(path, 100)` to push every split
 * percentage on the tile's path to 100%, then restores from a saved
 * snapshot when toggled back.
 */
const MosaicGrid: React.FC<MosaicGridProps> = ({
  tiles,
  value,
  onChange,
  focusedTileId,
  onFocusTile,
  className,
}) => {
  const [expandedTileId, setExpandedTileId] = useState<string | null>(null);
  const preExpandLayout = useRef<MosaicNode<string> | null>(null);

  const handleExpand = (id: string, path: MosaicBranch[]) => {
    if (expandedTileId === id) {
      onChange(preExpandLayout.current);
      preExpandLayout.current = null;
      setExpandedTileId(null);
    } else {
      preExpandLayout.current = value;
      if (value !== null) {
        onChange(updateTree(value, [createExpandUpdate(path, 100)]));
      }
      setExpandedTileId(id);
    }
  };

  const renderWindow = (id: string, path: MosaicBranch[]) => {
    const tile = tiles[id];
    if (!tile) return <div />;

    const focus = () => onFocusTile?.(id);
    const isFocused = focusedTileId === id;

    // Focus is folded into the action callbacks rather than fired from a
    // toolbar onPointerDown — calling onFocusTile in pointerdown caused a
    // re-render between pointerdown and click that swallowed the click on
    // the toolbar's buttons (needed two taps to fullscreen).
    const handleClose = () => {
      focus();
      if (expandedTileId === id) {
        preExpandLayout.current = null;
        setExpandedTileId(null);
      }
      if (value !== null) {
        const update = createRemoveUpdate(value, path);
        onChange(updateTree(value, [update]));
      }
    };
    const handleFullscreen = () => {
      focus();
      handleExpand(id, path);
    };

    return (
      <MosaicWindow<string>
        path={path}
        title={tile.title}
        toolbarControls={[]}
        className={isFocused ? styles.focused : undefined}
        renderToolbar={() => (
          // react-mosaic's react-dnd integration needs a native DOM node at
          // the toolbar root to attach the drag source ref. TileHeader is a
          // React FC, so we wrap it in a plain div the connector can grab.
          <div className={styles.toolbarHeader}>
            <TileHeader
              title={tile.title}
              onClose={handleClose}
              onFullscreen={handleFullscreen}
            />
          </div>
        )}
      >
        <TileIdScope tileId={id}>
          <div className={styles.bodyWrapper} onPointerDown={focus}>
            {tile.render()}
          </div>
        </TileIdScope>
      </MosaicWindow>
    );
  };

  return (
    <div className={clsx(styles.root, className)} data-testid="mosaic-grid">
      <Mosaic<string>
        className={styles.mosaic}
        value={value}
        onChange={onChange}
        renderTile={renderWindow}
        zeroStateView={
          <div className={styles.empty} data-testid="mosaic-grid-empty">
            No tiles open
          </div>
        }
      />
    </div>
  );
};

/**
 * Build a balanced binary tree layout from a flat list of tile ids.
 * Useful as the "Auto Layout" reset.
 */
export function autoLayout(ids: string[]): MosaicNode<string> | null {
  if (ids.length === 0) return null;
  return build(ids, "row");
}

function build(
  ids: string[],
  direction: "row" | "column"
): MosaicNode<string> {
  if (ids.length === 1) return ids[0];
  const mid = Math.ceil(ids.length / 2);
  const next: "row" | "column" = direction === "row" ? "column" : "row";
  return {
    direction,
    first: build(ids.slice(0, mid), next),
    second: build(ids.slice(mid), next),
    splitPercentage: 50,
  };
}

interface Rect {
  w: number;
  h: number;
}

interface LeafInfo {
  id: string;
  path: MosaicBranch[];
  rect: Rect;
}

/**
 * Walk the layout tree, returning every leaf with its path from root and
 * its bounding rect in unit space. Used for "split largest" and
 * "split by id" insertion strategies.
 */
function walkLeaves(
  node: MosaicNode<string>,
  rect: Rect = { w: 1, h: 1 },
  path: MosaicBranch[] = []
): LeafInfo[] {
  if (typeof node === "string") {
    return [{ id: node, path, rect }];
  }
  const p = (node.splitPercentage ?? 50) / 100;
  const isRow = node.direction === "row";
  const firstRect: Rect = isRow
    ? { w: rect.w * p, h: rect.h }
    : { w: rect.w, h: rect.h * p };
  const secondRect: Rect = isRow
    ? { w: rect.w * (1 - p), h: rect.h }
    : { w: rect.w, h: rect.h * (1 - p) };
  return [
    ...walkLeaves(node.first, firstRect, [...path, "first"]),
    ...walkLeaves(node.second, secondRect, [...path, "second"]),
  ];
}

function replaceAtPath(
  node: MosaicNode<string>,
  path: MosaicBranch[],
  replacement: MosaicNode<string>
): MosaicNode<string> {
  if (path.length === 0) return replacement;
  if (typeof node === "string") return replacement;
  const [head, ...rest] = path;
  return head === "first"
    ? { ...node, first: replaceAtPath(node.first, rest, replacement) }
    : { ...node, second: replaceAtPath(node.second, rest, replacement) };
}

/**
 * Insert a new tile id by splitting an existing tile 50/50. When
 * `targetId` is provided and found in the layout, that tile is split —
 * useful for "new tile appears next to the focused one". Otherwise
 * (or if the target id isn't present), the largest tile is split.
 *
 * Split direction follows the target leaf's longer axis so sub-tiles stay
 * roughly square — wider-than-tall splits as a `row` (vertical line),
 * taller-than-wide splits as a `column` (horizontal line).
 */
export function addTileToLayout(
  layout: MosaicNode<string> | null,
  newId: string,
  targetId?: string | null
): MosaicNode<string> {
  if (layout === null) return newId;

  const leaves = walkLeaves(layout);
  const target =
    (targetId ? leaves.find((l) => l.id === targetId) : null) ??
    leaves.reduce((largest, leaf) =>
      leaf.rect.w * leaf.rect.h > largest.rect.w * largest.rect.h
        ? leaf
        : largest
    );

  const direction: "row" | "column" =
    target.rect.w >= target.rect.h ? "row" : "column";

  const newSubtree: MosaicNode<string> = {
    direction,
    first: target.id,
    second: newId,
    splitPercentage: 50,
  };

  return replaceAtPath(layout, target.path, newSubtree);
}

/** Walk the layout tree and collect every tile id. */
export function collectTileIds(node: MosaicNode<string> | null): string[] {
  if (node === null) return [];
  if (typeof node === "string") return [node];
  return [...collectTileIds(node.first), ...collectTileIds(node.second)];
}

export default MosaicGrid;
