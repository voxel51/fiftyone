/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import React, { type ReactNode, type RefObject, useEffect } from "react";
import styles from "./TileBody.module.css";

export interface TileBodyProps {
  /** From {@link useLighterTileScene} — the initial viewport has settled
   * on-canvas. Reported to the surface as the scene half of its coordinated
   * reveal. */
  revealed: boolean;
  /** Reports `revealed` to the owning surface; called with `false` on
   * unmount so a sample change re-covers until the new sample settles. */
  onRevealChange: (revealed: boolean) => void;
  /** Host the Lighter singleton canvas attaches into. */
  lighterHostRef: RefObject<HTMLDivElement | null>;
  /** The media element (frame `<canvas>` or `<video>`). */
  children: ReactNode;
}

/**
 * Shared chrome for the video-annotation tiles: the media element with the
 * Lighter host overlaid. Renders unconditionally — the surface's opaque
 * loading cover hides the tile until the coordinated reveal; this
 * component's job is reporting the scene half of that signal.
 */
export const TileBody: React.FC<TileBodyProps> = ({
  revealed,
  onRevealChange,
  lighterHostRef,
  children,
}) => {
  useEffect(() => {
    onRevealChange(revealed);
    return () => onRevealChange(false);
  }, [revealed, onRevealChange]);

  return (
    <div className={styles.body}>
      {children}
      <div ref={lighterHostRef} className={styles.lighterHost} />
    </div>
  );
};
