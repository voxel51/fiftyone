import {
  ContextMenu,
  IconName,
  MenuIconTextItem,
  MenuSectionTitle,
  MenuSeparator,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useState } from "react";
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
import { TileIdScope, tileTypeFromId } from "../../lib/TilingProvider";
import {
  useSetTileTitle,
  useTileTitle,
  useTileTypes,
} from "../../lib/use-tile-state";
import { TileHeader } from "../Tile/Tile";
import {
  FullscreenExitIcon,
  SplitDownIcon,
  SplitRightIcon,
} from "../Tile/tile-icons";
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
  /** Called when the user selects a tile or invokes one of its actions. */
  onFocusTile?: (id: string, reason: "select" | "action") => void;
  /**
   * Spawn a sibling tile beside `id` (`"row"` = right, `"column"` =
   * below). Wiring this enables the header split buttons and the
   * matching context-menu items — pass `useTiling().splitTile`.
   */
  onSplitTile?: (id: string, direction: "row" | "column") => void;
  /**
   * Clone tile `id` next to itself. Enables the "Duplicate" context-menu
   * item — pass `useTiling().duplicateTile`.
   */
  onDuplicateTile?: (id: string) => void;
  /**
   * Replace tile `id` with a fresh tile of another registered kind.
   * Enables the "Change panel type" context-menu section.
   */
  onChangeTileType?: (id: string, type: string) => void;
  /**
   * Close every tile except `id`. Enables the "Close others"
   * context-menu item — pass `useTiling().closeOtherTiles`.
   */
  onCloseOtherTiles?: (id: string) => void;
  /** Tile id currently expanded to fullscreen. Omit for local state. */
  expandedTileId?: string | null;
  /** Called when the fullscreen tile changes. Omit for local state. */
  onExpandedTileIdChange?: (id: string | null) => void;
  /**
   * Rendered when the layout is empty. Defaults to a muted "No tiles
   * open" note; pass something actionable (e.g. `TilingZeroState`) to
   * make the empty canvas a spawn point.
   */
  zeroStateView?: React.ReactElement;
  className?: string;
}

interface TileWindowProps {
  path: MosaicBranch[];
  tileId: string;
  tile: MosaicTileConfig;
  isFocused: boolean;
  isFullscreen: boolean;
  onFocus: () => void;
  /** Focus with "action" semantics (never toggles off) — right-click. */
  onActionFocus: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onDuplicate?: () => void;
  onChangeType?: (type: string) => void;
  onCloseOthers?: () => void;
}

const TileWindow: React.FC<TileWindowProps> = ({
  path,
  tileId,
  tile,
  isFocused,
  isFullscreen,
  onFocus,
  onActionFocus,
  onClose,
  onFullscreen,
  onSplitRight,
  onSplitDown,
  onDuplicate,
  onChangeType,
  onCloseOthers,
}) => {
  const titleOverride = useTileTitle();
  const setTileTitle = useSetTileTitle();
  const tileTypes = useTileTypes();
  const [renameRequest, setRenameRequest] = useState(0);
  const title = titleOverride ?? tile.title;
  const hasSpawnActions = Boolean(onSplitRight || onSplitDown || onDuplicate);
  const hasTypeActions = Boolean(onChangeType && tileTypes.length > 0);
  const currentType = tileTypeFromId(tileId);
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  const contextMenu = (
    <>
      <MenuIconTextItem
        icon={IconName.Edit}
        text="Rename"
        onClick={() => setRenameRequest((current) => current + 1)}
      />
      <MenuSeparator />
      {onSplitRight && (
        <MenuIconTextItem
          icon={<SplitRightIcon />}
          text="Split right"
          onClick={onSplitRight}
        />
      )}
      {onSplitDown && (
        <MenuIconTextItem
          icon={<SplitDownIcon />}
          text="Split down"
          onClick={onSplitDown}
        />
      )}
      {onDuplicate && (
        <MenuIconTextItem
          icon={IconName.ContentCopy}
          text="Duplicate"
          onClick={onDuplicate}
        />
      )}
      {hasSpawnActions && <MenuSeparator />}
      {hasTypeActions ? (
        <>
          <MenuSectionTitle>Change panel type</MenuSectionTitle>
          {tileTypes.map((entry) => {
            const isCurrent = entry.type === currentType;
            return (
              <MenuIconTextItem
                key={entry.type}
                disabled={isCurrent}
                icon={entry.icon}
                text={entry.typeLabel}
                onClick={
                  isCurrent ? undefined : () => onChangeType?.(entry.type)
                }
              />
            );
          })}
          <MenuSeparator />
        </>
      ) : null}
      <MenuIconTextItem
        icon={isFullscreen ? <FullscreenExitIcon /> : IconName.Fullscreen}
        text={fullscreenLabel}
        onClick={onFullscreen}
      />
      <MenuSeparator />
      {onCloseOthers && (
        <MenuIconTextItem
          icon={IconName.Remove}
          text="Close others"
          onClick={onCloseOthers}
        />
      )}
      <MenuIconTextItem
        destructive
        icon={IconName.Close}
        text="Close"
        onClick={onClose}
      />
    </>
  );
  return (
    <MosaicWindow<string>
      path={path}
      title={title}
      toolbarControls={[]}
      className={isFocused ? styles.focused : undefined}
      renderToolbar={() => (
        // react-mosaic's react-dnd integration needs a native DOM node at
        // the toolbar root to attach the drag source ref. TileHeader is a
        // React FC, so we wrap it in a plain div the connector can grab.
        // The right-click menu wraps the header INSIDE that root so the
        // drag connector's node stays untouched. Right-click focuses with
        // "action" semantics so the settings sidebar shows the tile the
        // menu is about to act on; plain header clicks select via
        // TileHeader's own onSelect.
        <div className={styles.toolbarHeader} onContextMenu={onActionFocus}>
          <ContextMenu className={styles.toolbarContextMenu} menu={contextMenu}>
            <TileHeader
              title={title}
              onClose={onClose}
              onFullscreen={onFullscreen}
              isFullscreen={isFullscreen}
              onSplitRight={onSplitRight}
              onSplitDown={onSplitDown}
              onTitleChange={(nextTitle) => setTileTitle(nextTitle)}
              renameRequest={renameRequest}
              onSelect={onFocus}
            />
          </ContextMenu>
        </div>
      )}
    >
      <div className={styles.bodyWrapper} onPointerDown={onFocus}>
        {tile.render()}
      </div>
    </MosaicWindow>
  );
};

/**
 * Draggable, resizable grid layout wrapping `react-mosaic-component`.
 *
 * Each tile's `TileHeader` becomes the mosaic toolbar — react-mosaic
 * auto-wires the toolbar as the drag source, so dragging the header
 * moves the window. The body content (from `tile.render`) is everything
 * below the toolbar.
 *
 * Fullscreen is rendered as a view transform over the current layout:
 * the underlying layout tree stays unchanged, and `expandedTileId`
 * records which tile should show the inverse "Exit fullscreen" action.
 */
const MosaicGrid: React.FC<MosaicGridProps> = ({
  tiles,
  value,
  onChange,
  focusedTileId,
  onFocusTile,
  onSplitTile,
  onDuplicateTile,
  onChangeTileType,
  onCloseOtherTiles,
  expandedTileId,
  onExpandedTileIdChange,
  zeroStateView,
  className,
}) => {
  const [localExpandedTileId, setLocalExpandedTileId] = useState<string | null>(
    null,
  );
  const activeExpandedTileId =
    expandedTileId === undefined ? localExpandedTileId : expandedTileId;
  const setActiveExpandedTileId =
    onExpandedTileIdChange ?? setLocalExpandedTileId;
  const expandedPath =
    activeExpandedTileId && value
      ? findPathForTile(value, activeExpandedTileId)
      : null;
  const isExpandedActive = expandedPath !== null;
  const displayValue =
    value && expandedPath && expandedPath.length > 0
      ? updateTree(value, [createExpandUpdate(expandedPath, 100)])
      : value;

  // Clear stale fullscreen state if its tile no longer exists in the layout.
  useEffect(() => {
    if (activeExpandedTileId !== null && !isExpandedActive) {
      setActiveExpandedTileId(null);
    }
  }, [activeExpandedTileId, isExpandedActive, setActiveExpandedTileId]);

  const handleExpand = (id: string) => {
    if (activeExpandedTileId === id) {
      setActiveExpandedTileId(null);
    } else {
      setActiveExpandedTileId(id);
    }
  };

  const renderWindow = (id: string, path: MosaicBranch[]) => {
    const tile = tiles[id];
    if (!tile) return <div />;

    const focusForSelect = () => onFocusTile?.(id, "select");
    const focusForAction = () => onFocusTile?.(id, "action");
    const isFocused = focusedTileId === id;
    const isFullscreen = activeExpandedTileId === id;

    // Focus is folded into the action callbacks rather than fired from a
    // toolbar onPointerDown — calling onFocusTile in pointerdown caused a
    // re-render between pointerdown and click that swallowed the click on
    // the toolbar's buttons (needed two taps to fullscreen).
    const handleClose = () => {
      focusForAction();
      if (activeExpandedTileId === id) {
        setActiveExpandedTileId(null);
      }
      if (value !== null) {
        const update = createRemoveUpdate(value, path);
        onChange(updateTree(value, [update]));
      }
    };
    const handleFullscreen = () => {
      focusForAction();
      handleExpand(id);
    };
    // Spawn actions skip focusForAction: addTile focuses the new tile,
    // and pre-focusing the origin would only cause an extra flicker.
    const handleSplitRight = onSplitTile
      ? () => onSplitTile(id, "row")
      : undefined;
    const handleSplitDown = onSplitTile
      ? () => onSplitTile(id, "column")
      : undefined;
    const handleDuplicate = onDuplicateTile
      ? () => onDuplicateTile(id)
      : undefined;
    const handleChangeType = onChangeTileType
      ? (type: string) => onChangeTileType(id, type)
      : undefined;
    const handleCloseOthers = onCloseOtherTiles
      ? () => onCloseOtherTiles(id)
      : undefined;

    return (
      <TileIdScope tileId={id}>
        <TileWindow
          path={path}
          tileId={id}
          tile={tile}
          isFocused={isFocused}
          isFullscreen={isFullscreen}
          onFocus={focusForSelect}
          onActionFocus={focusForAction}
          onClose={handleClose}
          onFullscreen={handleFullscreen}
          onSplitRight={handleSplitRight}
          onSplitDown={handleSplitDown}
          onDuplicate={handleDuplicate}
          onChangeType={handleChangeType}
          onCloseOthers={handleCloseOthers}
        />
      </TileIdScope>
    );
  };

  return (
    <div className={clsx(styles.root, className)} data-cy="mosaic-grid">
      <Mosaic<string>
        className={styles.mosaic}
        value={displayValue}
        onChange={isExpandedActive ? () => undefined : onChange}
        renderTile={renderWindow}
        zeroStateView={
          zeroStateView !== undefined ? (
            <div className={styles.zeroStateSlot} data-cy="mosaic-grid-empty">
              {zeroStateView}
            </div>
          ) : (
            <div className={styles.empty} data-cy="mosaic-grid-empty">
              No tiles open
            </div>
          )
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

function build(ids: string[], direction: "row" | "column"): MosaicNode<string> {
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
  path: MosaicBranch[] = [],
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
  replacement: MosaicNode<string>,
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
 * Without an explicit `direction`, the split follows the target leaf's
 * longer axis so sub-tiles stay roughly square — wider-than-tall splits
 * as a `row` (vertical line), taller-than-wide splits as a `column`
 * (horizontal line). Pass `direction` to force it (split right = `row`,
 * split down = `column`).
 */
export function addTileToLayout(
  layout: MosaicNode<string> | null,
  newId: string,
  targetId?: string | null,
  direction?: "row" | "column",
): MosaicNode<string> {
  if (layout === null) return newId;
  if (collectTileIds(layout).includes(newId)) {
    throw new Error(`Tile id "${newId}" already exists in layout`);
  }

  const leaves = walkLeaves(layout);
  const target =
    (targetId ? leaves.find((l) => l.id === targetId) : null) ??
    leaves.reduce((largest, leaf) =>
      leaf.rect.w * leaf.rect.h > largest.rect.w * largest.rect.h
        ? leaf
        : largest,
    );

  const newSubtree: MosaicNode<string> = {
    direction: direction ?? (target.rect.w >= target.rect.h ? "row" : "column"),
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

function findPathForTile(
  node: MosaicNode<string>,
  id: string,
  path: MosaicBranch[] = [],
): MosaicBranch[] | null {
  if (typeof node === "string") return node === id ? path : null;
  return (
    findPathForTile(node.first, id, [...path, "first"]) ??
    findPathForTile(node.second, id, [...path, "second"])
  );
}

export default MosaicGrid;
