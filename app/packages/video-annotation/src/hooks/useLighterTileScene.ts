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

type LighterScene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

/**
 * Attach the SINGLETON Lighter canvas into `hostRef`. One
 * SharedPixiApplication per page binds to the first canvas it sees; a fresh
 * canvas would leave Pixi rendering to the old (image-modal) one.
 */
function useAttachedSingletonCanvas(
  hostRef: RefObject<HTMLDivElement | null>,
): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

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

  return canvas;
}

/** Keep the scene's color mapping in sync with the FiftyOne color scheme. */
function useSceneColorScheme(scene: LighterScene, sceneId: string): void {
  const scheme = useColorScheme();
  const seed = useColorSeed();

  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) {
      return;
    }

    scene.updateColorMappingContext({ colorScheme: scheme, seed });
  }, [scene, sceneId, scheme, seed]);
}

/**
 * Install a no-pixel canonical-media overlay sized to `dims`. Lighter draws
 * overlays relative to it. Returns whether the current scene's media is
 * installed — overlays added before it exists have no coordinate context.
 */
function useCanonicalMediaInstall(
  scene: LighterScene,
  sceneId: string,
  dims: Dimensions | null,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [sceneId]);

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
    setReady(true);
  }, [scene, sceneId, dims]);

  return ready;
}

/**
 * Reset the viewport to the resting IDENTITY frame once the renderer and the
 * canonical media's real bounds are both ready. Identity (not `fitToContent`,
 * which frames the labels' bbox) keeps the letterboxed media aligned with
 * world coordinates. Bounds arrive via ResizeObserver after layout, so we gate
 * on the `bounds-changed` event rather than renderer-ready alone (which races
 * a zero-size scene).
 */
function useViewportReset(scene: LighterScene, sceneId: string): void {
  const [rendererReady, setRendererReady] = useState(false);
  const [mediaBoundsReady, setMediaBoundsReady] = useState(false);
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  useEffect(() => {
    setMediaBoundsReady(false);
  }, [sceneId]);

  useEventHandler(
    "lighter:renderer-ready",
    useCallback(() => setRendererReady(true), []),
    { once: true },
  );

  useEventHandler(
    "lighter:canonical-media-bounds-changed",
    useCallback(() => setMediaBoundsReady(true), []),
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
}

/**
 * Owns the Lighter scene lifecycle shared by both video-annotation tiles:
 * attaches the singleton canvas, sets up the pixi scene under a fresh scene
 * id, syncs the color scheme, installs a canonical-media overlay sized to
 * `dims`, and resets the viewport once renderer + media are ready.
 *
 * `dims` is injected so the hook stays agnostic to how the tile discovered
 * them. `sceneIdDeps` recompute the scene id (the video tile re-mints per
 * source; pass nothing for a once-per-mount scene).
 *
 * Returns the scene plus whether its canonical media is installed; feed
 * `canonicalMediaReady` into {@link useVideoAnnotationSyncBundle}.
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
  scene: LighterScene;
  canonicalMediaReady: boolean;
} {
  const canvas = useAttachedSingletonCanvas(hostRef);

  // Modal options so activePaths / showOverlays / alpha match the sidebar.
  const options = useModalLookerOptions();

  // Fresh scene id whenever `sceneIdDeps` change, so a new source gets its
  // own scene.
  const sceneId = useMemo(
    () => `${sceneIdPrefix}-${Math.random().toString(36).slice(2, 9)}`,
    // caller-supplied dep list; exhaustive-deps can't statically verify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sceneIdDeps,
  );

  const { scene } = useLighterSetupWithPixi(canvas, options, sceneId);

  useSceneColorScheme(scene, sceneId);
  const canonicalMediaReady = useCanonicalMediaInstall(scene, sceneId, dims);
  useViewportReset(scene, sceneId);

  return { scene, canonicalMediaReady };
}
