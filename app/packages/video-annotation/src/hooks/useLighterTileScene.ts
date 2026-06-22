/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { useModalLookerOptions } from "@fiftyone/state";
import {
  type DependencyList,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { singletonCanvas } from "../../../core/src/components/Modal/Lighter/SharedCanvas";
import { ExternalCanonicalMedia } from "../media/ExternalCanonicalMedia";
import { useColorScheme, useColorSeed } from "../state/accessors";

/** Intrinsic media resolution the canonical-media overlay is sized to. */
interface Dimensions {
  w: number;
  h: number;
}

/**
 * Owns the Lighter scene lifecycle shared by both video-annotation tiles:
 * attaches the singleton canvas into `hostRef`, sets up the pixi scene under a
 * freshly-minted scene id, syncs the FiftyOne color scheme, installs a
 * canonical-media overlay sized to `dims`, and fits the viewport once the
 * renderer and media are both ready.
 *
 * `dims` is injected so the hook stays agnostic to *how* the tile discovered
 * them (native `<video>` metadata vs. a decoded imavid bitmap). `sceneIdDeps`
 * recompute the scene id — the video tile re-mints per source; pass nothing
 * (default `[]`) for a once-per-mount scene.
 *
 * Returns the scene plus whether its canonical media is installed.
 * `canonicalMediaReady` gates the overlay sync (overlays added before media
 * exists have no coordinate context and render with broken bounds), so feed it
 * straight into {@link useVideoAnnotationSyncBundle}.
 */
export function useLighterTileScene({
  hostRef,
  dims,
  sceneIdPrefix,
  sceneIdDeps = [],
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  dims: Dimensions | null;
  sceneIdPrefix: string;
  sceneIdDeps?: DependencyList;
}): {
  scene: ReturnType<typeof useLighterSetupWithPixi>["scene"];
  canonicalMediaReady: boolean;
} {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  // Attach the SINGLETON Lighter canvas into our host. There is one
  // SharedPixiApplication per page bound to the first canvas it ever sees;
  // creating a fresh canvas would leave Pixi rendering to the old
  // (image-modal) canvas instead. singletonCanvas detaches cleanly from any
  // previous container and reattaches here.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    setCanvas(singletonCanvas.getCanvas(host));

    return () => {
      singletonCanvas.detach();
    };
  }, [hostRef]);

  // Modal options so activePaths / showOverlays / alpha match the sidebar and
  // overlays.
  const options = useModalLookerOptions();

  // Mint a fresh scene id whenever `sceneIdDeps` change, so a new source gets
  // its own Lighter scene.
  const sceneId = useMemo(
    () => `${sceneIdPrefix}-${Math.random().toString(36).slice(2, 9)}`,
    // caller-supplied dep list; exhaustive-deps can't statically verify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sceneIdDeps
  );

  const { scene } = useLighterSetupWithPixi(canvas!, options, sceneId);

  // Wire the FiftyOne color scheme so overlays match the rest of the UI.
  const scheme = useColorScheme();
  const seed = useColorSeed();
  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) {
      return;
    }

    scene.updateColorMappingContext({ colorScheme: scheme, seed });
  }, [scene, sceneId, scheme, seed]);

  // Tracks whether the *current* scene has its canonical media installed. The
  // overlay diff gates on this — without canonical media, overlays added to
  // the scene have no coordinate context to position against, so they render
  // with broken bounds and a later in-place `relativeBounds` update doesn't
  // fix them. Reset whenever `sceneId` changes (new scene → not installed yet)
  // and set true at the bottom of the install effect.
  const [canonicalMediaReady, setCanonicalMediaReady] = useState(false);
  useEffect(() => {
    setCanonicalMediaReady(false);
  }, [sceneId]);

  // Install a no-pixel canonical-media overlay sized to the media's intrinsic
  // resolution. Lighter draws overlays relative to it; the element behind the
  // canvas provides the visible pixels.
  useEffect(() => {
    if (!scene || !dims) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    const media = new ExternalCanonicalMedia({
      width: dims.w,
      height: dims.h,
    });

    scene.addOverlay(media);
    scene.setCanonicalMedia(media);
    setCanonicalMediaReady(true);
  }, [scene, sceneId, dims]);

  // Viewport init — without this the pixi-viewport never gets framed and
  // overlays render with zero / wrong coordinate transforms. The resting frame
  // is IDENTITY (scale 1, pan 0): the media element behind the canvas uses
  // `object-fit: contain`, so its letterboxed pixels already equal the scene's
  // world coordinates (see useSyncMediaTransform). `fitToContent` would instead
  // frame the LABELS' bounding box (it excludes the canonical media), zooming
  // into the detections and dragging the media element's transform with it.
  // Resetting needs the renderer ready (the pixi-viewport must exist) AND the
  // canonical media's REAL bounds: `canonicalMediaReady` flips synchronously at
  // install, but the bounds come from a ResizeObserver once the container has
  // laid out, so acting at renderer-ready alone races a zero-size scene (black
  // until the user hits 'r'). `canonical-media-bounds-changed` only fires with
  // non-zero bounds (see ExternalCanonicalMedia), so it is the readiness
  // signal; reset once both are true.
  const [rendererReady, setRendererReady] = useState(false);
  const [mediaBoundsReady, setMediaBoundsReady] = useState(false);
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useEffect(() => {
    setMediaBoundsReady(false);
  }, [sceneId]);

  useEventHandler(
    "lighter:renderer-ready",
    useCallback(() => setRendererReady(true), []),
    { once: true }
  );

  useEventHandler(
    "lighter:canonical-media-bounds-changed",
    useCallback(() => setMediaBoundsReady(true), [])
  );

  useEffect(() => {
    if (!scene || !rendererReady || !mediaBoundsReady) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    scene.resetZoomPan();
  }, [scene, sceneId, rendererReady, mediaBoundsReady]);

  return { scene, canonicalMediaReady };
}
