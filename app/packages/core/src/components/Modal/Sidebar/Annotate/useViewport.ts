import { getEventBus } from "@fiftyone/events";
import type {
  LighterEventGroup,
  Rect,
  Scene2D,
  ViewportState,
} from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import { useCropToContentSetting, useModalViewport } from "@fiftyone/state";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const { scene } = useLighter();
  const callback = useCallback(
    ({ bounds }: { bounds: Rect }) => {
      setBounds(bounds);
      const bus = getEventBus<LighterEventGroup>(scene?.getEventChannel());
      // Stop listening after the first instance of the event
      bus.off("lighter:canonical-media-bounds-changed", callback);
    },
    [scene]
  );

  useEffect(() => {
    if (!scene) {
      return;
    }
    const bus = getEventBus<LighterEventGroup>(scene?.getEventChannel());

    bus.on("lighter:canonical-media-bounds-changed", callback);
    return () => {
      bus.off("lighter:canonical-media-bounds-changed", callback);
    };
  }, [callback, scene]);

  return bounds;
};

const useRendererReady = () => {
  const [ready, setReady] = useState(false);
  const { scene } = useLighter();

  const callback = useCallback(() => {
    setReady(true);
    const bus = getEventBus<LighterEventGroup>(scene?.getEventChannel());
    // Stop listening after the event has fired
    bus.off("lighter:renderer-ready", callback);
  }, [scene]);

  useEffect(() => {
    if (!scene) {
      return;
    }
    const bus = getEventBus<LighterEventGroup>(scene?.getEventChannel());

    bus.on("lighter:renderer-ready", callback);
    return () => {
      bus.off("lighter:renderer-ready", callback);
    };
  }, [callback, scene]);

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

  const callback = useCallback(() => {
    setInitialized(true);
    const bus = getEventBus<LighterEventGroup>(scene?.getEventChannel());
    // Stop listening after the first instance of the event
    bus.off("lighter:viewport-moved", callback);
  }, [scene]);

  useEffect(() => {
    if (!scene) {
      return;
    }
    const bus = getEventBus(scene?.getEventChannel());

    bus.on("lighter:viewport-moved", callback);
    return () => {
      bus.off("lighter:viewport-moved", callback);
    };
  }, [callback, scene]);

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
