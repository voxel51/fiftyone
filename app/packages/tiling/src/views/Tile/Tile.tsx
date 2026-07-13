import {
  Button,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";
import {
  FullscreenExitIcon,
  SplitDownIcon,
  SplitRightIcon,
  SplitTileIcon,
} from "./tile-icons";
import styles from "./Tile.module.css";

export interface TileHeaderProps {
  title: string;
  onClose: () => void;
  onFullscreen: () => void;
  /** Whether this tile is currently expanded to fullscreen. */
  isFullscreen?: boolean;
  /** Spawn a sibling tile to the right. Omit to hide the button. */
  onSplitRight?: () => void;
  /** Spawn a sibling tile below. Omit to hide the button. */
  onSplitDown?: () => void;
  /** Commit a user-authored title from the inline title editor. */
  onTitleChange?: (title: string) => void;
  /** Incrementing token that requests the inline title editor. */
  renameRequest?: number;
  /**
   * Fired when the header itself is clicked — clicks on the header's
   * buttons are excluded, since those manage focus through their own
   * callbacks. Hosts use it to select the tile like a body click.
   */
  onSelect?: () => void;
  className?: string;
  /** Render the title with transient cross-panel emphasis. */
  highlighted?: boolean;
}

/**
 * The header bar for a tile — title + the action set (split right/down
 * when the host wires them, fullscreen, close). Exported separately from
 * `Tile` so the mosaic grid can use it as react-mosaic's `renderToolbar`
 * (the toolbar is the drag source — the entire header becomes the drag
 * handle). The split actions rest as ONE direction-neutral glyph (so the
 * affordance is always advertised) and resolve into the split-right /
 * split-down pair on header hover or keyboard focus; fullscreen and
 * close stay persistent.
 */
export const TileHeader: React.FC<TileHeaderProps> = ({
  title,
  onClose,
  onFullscreen,
  isFullscreen = false,
  onSplitRight,
  onSplitDown,
  onTitleChange,
  renameRequest = 0,
  onSelect,
  className,
  highlighted = false,
}) => {
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  const fullscreenIcon = isFullscreen
    ? FullscreenExitIcon
    : IconName.Fullscreen;
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastRenameRequestRef = useRef(renameRequest);

  useEffect(() => {
    if (!editing) {
      setDraftTitle(title);
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing, title]);

  useEffect(() => {
    if (
      renameRequest === lastRenameRequestRef.current ||
      renameRequest <= 0 ||
      !onTitleChange
    ) {
      return;
    }
    lastRenameRequestRef.current = renameRequest;
    setDraftTitle(title);
    setEditing(true);
  }, [onTitleChange, renameRequest, title]);

  const beginEditing = () => {
    if (!onTitleChange) return;
    setDraftTitle(title);
    setEditing(true);
  };

  const startEditing = (event: React.MouseEvent) => {
    event.stopPropagation();
    beginEditing();
  };

  const commitTitle = () => {
    if (!editing) return;
    const nextTitle = draftTitle.trim();
    setEditing(false);
    setDraftTitle(title);
    if (nextTitle.length > 0 && nextTitle !== title) {
      onTitleChange(nextTitle);
    }
  };

  const cancelTitleEdit = () => {
    setEditing(false);
    setDraftTitle(title);
  };

  const stopTitleEditPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    // onClick (not pointerdown — a focus re-render between pointerdown and
    // click swallows button clicks) and scoped to this element: voodo's
    // ContextMenu opens via a programmatic click on a hidden node OUTSIDE
    // this header, which must not read as a select.
    <div
      className={clsx(styles.header, className)}
      data-testid="tile-header"
      onClick={
        onSelect
          ? (event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              if ((event.target as HTMLElement).closest("input")) return;
              onSelect();
            }
          : undefined
      }
    >
      {editing ? (
        <input
          aria-label="Panel title"
          className={styles.titleInput}
          data-testid="tile-header-title-input"
          onBlur={commitTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onClick={stopTitleEditPropagation}
          onDoubleClick={stopTitleEditPropagation}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              commitTitle();
            } else if (event.key === "Escape") {
              cancelTitleEdit();
            }
          }}
          onPointerDown={stopTitleEditPropagation}
          ref={inputRef}
          type="text"
          value={draftTitle}
        />
      ) : (
        <Text
          variant={TextVariant.Xs}
          color={TextColor.Secondary}
          className={clsx(styles.title, highlighted && styles.highlightedTitle)}
          data-highlighted={highlighted || undefined}
          data-testid="tile-header-title"
          onDoubleClick={startEditing}
          title={title}
        >
          {title}
        </Text>
      )}
      <div className={styles.actions}>
        {(onSplitRight || onSplitDown) && (
          <>
            {/* Decorative stand-in, never interactive: by the time a
                pointer could click it, hover has already swapped in the
                real buttons. A Button (focus-skipped) keeps its box
                metrics identical to theirs. */}
            <Button
              variant={Variant.Borderless}
              size={Size.Xs}
              className={styles.splitHint}
              data-testid="tile-header-split-hint"
              leadingIcon={SplitTileIcon}
              aria-hidden="true"
              tabIndex={-1}
            />
            <div className={styles.splitActions}>
              {onSplitRight && (
                <Button
                  variant={Variant.Borderless}
                  size={Size.Xs}
                  data-testid="tile-header-split-right"
                  leadingIcon={SplitRightIcon}
                  onClick={onSplitRight}
                  aria-label="Split right"
                  title="Split right"
                />
              )}
              {onSplitDown && (
                <Button
                  variant={Variant.Borderless}
                  size={Size.Xs}
                  data-testid="tile-header-split-down"
                  leadingIcon={SplitDownIcon}
                  onClick={onSplitDown}
                  aria-label="Split down"
                  title="Split down"
                />
              )}
            </div>
          </>
        )}
        <Button
          variant={Variant.Borderless}
          size={Size.Xs}
          className={isFullscreen ? styles.fullscreenActive : undefined}
          data-testid="tile-header-fullscreen"
          leadingIcon={fullscreenIcon}
          onClick={onFullscreen}
          aria-label={fullscreenLabel}
          aria-pressed={isFullscreen}
          title={fullscreenLabel}
        />
        <Button
          variant={Variant.Borderless}
          size={Size.Xs}
          data-testid="tile-header-close"
          leadingIcon={IconName.Close}
          onClick={onClose}
          aria-label="Close"
          title="Close"
        />
      </div>
    </div>
  );
};

export interface TileProps {
  title: string;
  onClose: () => void;
  onFullscreen: () => void;
  isFullscreen?: boolean;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Standalone tile chrome — header + bordered content area. Used by stories
 * to render a content tile (CameraTile, LidarTile, etc.) in isolation.
 *
 * Inside `MosaicGrid`, the chrome is split: `TileHeader` becomes the
 * draggable mosaic toolbar, and the content tile renders directly as the
 * window body — so this component isn't used there.
 */
const Tile: React.FC<TileProps> = ({
  title,
  onClose,
  onFullscreen,
  isFullscreen,
  children,
  className,
}) => (
  <div className={clsx(styles.root, className)}>
    <TileHeader
      title={title}
      onClose={onClose}
      onFullscreen={onFullscreen}
      isFullscreen={isFullscreen}
    />
    <div className={styles.content}>{children}</div>
  </div>
);

export default Tile;
