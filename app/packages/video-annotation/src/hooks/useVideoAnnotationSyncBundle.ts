/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLighterSetupWithPixi } from "@fiftyone/lighter";
import type { RefObject } from "react";
import { useStream } from "@fiftyone/playback";
import type { FrameLabelSnapshot } from "../streams/SyntheticLabelStream";
import { useFrameOverlaySync } from "../sync/useFrameOverlaySync";
import { useSyncLighterAnnotation } from "../sync/useSyncLighterAnnotation";
import { useSyncLighterLabelStream } from "../sync/useSyncLighterLabelStream";
import { useSyncMediaTransform } from "../sync/useSyncMediaTransform";
import { useSyncSidebarFromSnapshot } from "../sync/useSyncSidebarFromSnapshot";
import { useSyncSidebarFromTemporalOverlays } from "../sync/useSyncSidebarFromTemporalOverlays";
import { useTemporalOverlaySync } from "../sync/useTemporalOverlaySync";
import { LABELS_STREAM_ID } from "../utils/ids";

type TileScene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

/**
 * The complete set of overlay / sidebar sync hooks both lighter tiles wire
 * up, in their order-sensitive order. The labels-stream snapshot is acquired
 * internally so the tile never touches the stream id.
 *
 * `mediaRef` is the element the media transform tracks so scroll-zoom scales
 * the picture, not just the overlays — the `<video>` for the native tile, the
 * frame `<canvas>` for imavid.
 */
export function useVideoAnnotationSyncBundle<T extends HTMLElement>({
  scene,
  field,
  canonicalMediaReady,
  mediaRef,
}: {
  scene: TileScene;
  field: string;
  canonicalMediaReady: boolean;
  mediaRef: RefObject<T | null>;
}): void {
  const snapshot = useStream<FrameLabelSnapshot>(LABELS_STREAM_ID);

  useFrameOverlaySync(scene, snapshot, field, canonicalMediaReady);
  useTemporalOverlaySync(scene, canonicalMediaReady);
  useSyncSidebarFromSnapshot(scene, snapshot, field, canonicalMediaReady);
  useSyncSidebarFromTemporalOverlays(scene, canonicalMediaReady);

  useSyncLighterAnnotation(scene);
  useSyncLighterLabelStream(scene);

  useSyncMediaTransform(scene, mediaRef);
}
