/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RefObject } from "react";
import type { LighterScene } from "../hooks/sceneSetupHooks";
import { useVideoAnnotationSyncBundle } from "../hooks/useVideoAnnotationSyncBundle";
import { useVideoExploreSyncBundle } from "../hooks/useVideoExploreSyncBundle";

/** Which sync bundle a media tile arms. Explore is the read-only half. */
export type SurfaceMode = "annotate" | "explore";

export interface SyncProps<T extends HTMLElement> {
  scene: LighterScene;
  canonicalMediaReady: boolean;
  /** The picture element the media transform keeps in step with the viewport. */
  mediaRef: RefObject<T | null>;
}

/**
 * Null-rendering hosts for the two sync bundles. Which bundle runs is a
 * per-surface choice, and hooks cannot be called conditionally — so the
 * choice becomes which component is rendered, and each one's hooks
 * stay unconditional inside it.
 */
export function AnnotateSync<T extends HTMLElement>(props: SyncProps<T>): null {
  useVideoAnnotationSyncBundle(props);
  return null;
}

export function ExploreSync<T extends HTMLElement>(props: SyncProps<T>): null {
  useVideoExploreSyncBundle(props);
  return null;
}
