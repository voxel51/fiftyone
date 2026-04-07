import { getEventBus } from "@fiftyone/events";
import type {
  LighterEventGroup,
  Rect,
  Scene2D,
  ViewportState,
} from "@fiftyone/lighter";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import { useCropToContentSetting, useModalViewport } from "@fiftyone/state";
import { useCallback, useEffect, useRef, useState } from "react";

const useSceneEventHandler = () => {
  const { scene } = useLighter();

  return useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
};

const useInitialOverlays = (initialOverlayIds: Set<string> | null) => {
  const overlaysCount = useRef(0);

  const [ready, setReady] = useState(false);
  const { scene } = useLighter();

  const callback = useCallback(
    ({ id }: { id: string }) => {
      if (initialOverlayIds?.has(id)) {
        overlaysCount.current += 1;
      }

      if (overlaysCount.current === initialOverlayIds?.size) {
        setReady(true);
        const bus = getEventBus<LighterEventGroup>(scene?.getEventChannel());
        // All initial overlays have been added, we can remove the listener
        bus.off("lighter:overlay-added", callback);
      }
    },
    [initialOverlayIds, scene]
  );
  useLighterEventHandler("lighter:overlay-added");

  useEffect(() => {
    if (!scene) {
      return;
    }
    const bus = getEventBus<LighterEventGroup>(scene?.getEventChannel());

    bus.on("lighter:overlay-added", callback);
    return () => {
      bus.off("lighter:overlay-added", callback);
    };
  }, [callback, scene]);

  return ready;
};

const useCanonicalMediaBounds = () => {
  const [bounds, setBounds] = useState<Rect | null>(null);

  useSceneEventHandler()(
    "lighter:canonical-media-bounds-changed",
    useCallback(({ bounds }: { bounds: Rect }) => {
      setBounds(bounds);
    }, []),
    { once: true }
  );

  return bounds;
};

const useRendererReady = () => {
  const [ready, setReady] = useState(false);

  useSceneEventHandler()(
    "lighter:canonical-media-bounds-changed",
    useCallback(() => {
      setReady(true);
    }, []),
    { once: true }
  );

  return ready;
};

const fitOverlays = (
  scene: Scene2D,
  overlayIds: Set<string>
): ViewportState => {
  // Compute minimum bounding box
  // https://en.wikipedia.org/wiki/Minimum_bounding_box
  for (const id in overlayIds) {
    const overlay = scene.getOverlay(id);

    if (overlay && TypeGuards.isSpatial(overlay)) {
      // Update minimum bounding box
    }
  }

  return { scale: 1, panX: 0, panY: 0 };
};

const useInitializeViewport = (
  overlayIds: Set<string> | null,
  mediaBounds: Rect | null
) => {
  const [crop] = useCropToContentSetting();
  const savedViewport = useModalViewport();
  const { scene } = useLighter();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!mediaBounds || !overlayIds || !scene) {
      return;
    }

    if (savedViewport) {
      scene.setViewportState(savedViewport);
    }

    if (crop) {
      scene.setViewportState(fitOverlays(scene, overlayIds));
    }
  }, [crop, overlayIds, mediaBounds, savedViewport, scene]);

  useSceneEventHandler()(
    "lighter:viewport-moved",
    useCallback(() => {
      setInitialized(true);
    }, []),
    { once: true }
  );

  return initialized;
};

const useViewport = (initialOverlayIds: Set<string> | null) => {
  const mediaBounds = useCanonicalMediaBounds();
  const overlaysReady = useInitialOverlays(initialOverlayIds);
  const rendererReady = useRendererReady();

  const initialized = useInitializeViewport(initialOverlayIds, mediaBounds);

  return {
    ready: initialized && overlaysReady && rendererReady,
  };
};

export default useViewport;
