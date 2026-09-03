/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import React, { type ReactNode, type RefObject, useEffect } from "react";
import { useSetSceneRevealed } from "../state/surfaceReveal";
import styles from "./TileBody.module.css";

export interface TileBodyProps {
  /** From {@link useLighterTileScene} — the initial viewport has settled
   * on-canvas. Published to `surfaceReveal` as the scene half of the
   * surface's coordinated reveal. */
  revealed: boolean;
  /** Host the Lighter singleton canvas attaches into. */
  lighterHostRef: RefObject<HTMLDivElement | null>;
  /** The media element (frame `<canvas>` or `<video>`). */
  children: ReactNode;
}

/**
 * Shared chrome for the video-annotation tiles: the media element with the
 * Lighter host overlaid. Renders unconditionally — the surface's opaque
 * loading cover (see `surfaceReveal`) hides the tile until the coordinated
 * reveal; this component's job is publishing the scene half of that signal.
 */
export const TileBody: React.FC<TileBodyProps> = ({
  revealed,
  lighterHostRef,
  children,
}) => {
  const setSceneRevealed = useSetSceneRevealed();

  useEffect(() => {
    setSceneRevealed(revealed);
    return () => setSceneRevealed(false);
  }, [revealed, setSceneRevealed]);

  return (
    <div className={styles.body}>
      {children}
      <div ref={lighterHostRef} className={styles.lighterHost} />
    </div>
  );
};
