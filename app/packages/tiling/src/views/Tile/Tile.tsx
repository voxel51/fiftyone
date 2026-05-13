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
import React from "react";
import styles from "./Tile.module.css";

export interface TileHeaderProps {
  title: string;
  onClose: () => void;
  onFullscreen: () => void;
  className?: string;
}

/**
 * The header bar for a tile — title + the locked-down action set
 * (fullscreen + close). Exported separately from `Tile` so the mosaic
 * grid can use it as react-mosaic's `renderToolbar` (the toolbar is the
 * drag source — the entire header becomes the drag handle).
 */
export const TileHeader: React.FC<TileHeaderProps> = ({
  title,
  onClose,
  onFullscreen,
  className,
}) => (
  <div className={clsx(styles.header, className)} data-testid="tile-header">
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      className={styles.title}
      title={title}
    >
      {title}
    </Text>
    <div className={styles.actions}>
      <Button
        variant={Variant.Borderless}
        size={Size.Xs}
        data-testid="tile-header-fullscreen"
        leadingIcon={IconName.Fullscreen}
        onClick={onFullscreen}
        aria-label="Fullscreen"
        title="Fullscreen"
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

export interface TileProps {
  title: string;
  onClose: () => void;
  onFullscreen: () => void;
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
  children,
  className,
}) => (
  <div className={clsx(styles.root, className)}>
    <TileHeader
      title={title}
      onClose={onClose}
      onFullscreen={onFullscreen}
    />
    <div className={styles.content}>{children}</div>
  </div>
);

export default Tile;
