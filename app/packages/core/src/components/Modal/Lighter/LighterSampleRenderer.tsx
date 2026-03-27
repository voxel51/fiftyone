/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  DEFAULT_ZOOM_PAD,
  ImageOptions,
  ImageOverlay,
  Scene2D,
  overlayFactory,
  useLighter,
  useLighterEventBus,
  useLighterSetupWithPixi,
  UNDEFINED_LIGHTER_SCENE_ID,
} from "@fiftyone/lighter";
import type { ModalViewportState, Sample } from "@fiftyone/state";
import { getSampleSrc, useModalLookerOptions } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { activeLabelSchemas } from "../Sidebar/Annotate/state";
import { extractZoomTarget } from "./utils";
import { LighterToolbar } from "./LighterToolbar";
import { singletonCanvas } from "./SharedCanvas";
import { useBridge } from "./useBridge";
import useViewportInit from "./useViewportInit";
import useRetrieveViewport from "./useRetrieveViewport";

export interface LighterSampleRendererProps {
  /** Custom CSS class name */
  className?: string;
  /** Sample to display */
  sample: Sample;
}

/**
 * Lighter unit sample renderer with PixiJS renderer.
 */
export const LighterSampleRenderer = ({
  className = "",
  sample,
}: LighterSampleRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // unique scene id allows us to destroy/recreate scenes reliably
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [isCanvasHovered, setIsCanvasHovered] = useState(false);

  const { scene, isReady, addOverlay } = useLighter();

  // use a ref for the sample data, effects do not run solely because the
  // sample changed
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  const sampleId = sample?.sample?._id;
  const { effectiveZoom, initialViewport } = useViewportInit(sampleId);

  // The container starts hidden only when we need to wait for queueInitialZoom
  // (the zoomTarget path). For initialViewport and the default case the scene
  // is immediately visible, so there is no latency regression.
  const [isRevealed, setIsRevealed] = useState(!effectiveZoom);

  const eventChannel = scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID;
  const eventBus = useLighterEventBus(eventChannel);

  useEffect(() => {
    if (effectiveZoom) {
      return eventBus.on("lighter:viewport-initialized", () => {
        setIsRevealed(true);
        console.log("viewport-initialized");
      });
    }
  }, [effectiveZoom, eventBus]);

  /**
   * This effect is responsible for loading the sample and adding the overlays to the scene.
   */
  useEffect(() => {
    if (!isReady || !scene) return;

    const sample = sampleRef.current;
    const mediaUrl =
      sample.urls.length > 0 && sample.urls[0].url
        ? getSampleSrc(sample.urls[0].url)
        : null;

    if (mediaUrl) {
      const mediaOverlay = overlayFactory.create<ImageOptions, ImageOverlay>(
        "image",
        {
          src: mediaUrl,
          maintainAspectRatio: true,
        }
      );
      addOverlay(mediaOverlay, false);

      // Set the image overlay as canonical media for coordinate transformations
      scene.setCanonicalMedia(mediaOverlay);
    }
  }, [isReady, addOverlay, scene]);

  useEffect(() => {
    // sceneId should be deterministic, but unique for a given sample snapshot
    const sample = sampleRef.current;
    setSceneId(
      `${sample?.sample?._id}-${sample?.sample?.last_modified_at?.datetime}`
    );
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsCanvasHovered(true)}
      onMouseLeave={() => setIsCanvasHovered(false)}
      className={`lighter-sample-renderer ${className}`}
      data-cy="lighter-sample-renderer"
      id="lighter-sample-renderer-container"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        visibility: isRevealed ? "visible" : "hidden",
      }}
    >
      {containerRef.current && sceneId && (
        <LighterSetupImpl
          containerRef={containerRef}
          sceneId={sceneId}
          sampleRef={sampleRef}
          effectiveZoom={effectiveZoom}
          initialViewport={initialViewport}
        />
      )}
      {isCanvasHovered && <LighterToolbar />}
    </div>
  );
};

const LighterSetupImpl = (props: {
  containerRef: React.RefObject<HTMLDivElement>;
  sceneId: string;
  sampleRef: React.RefObject<Sample>;
  effectiveZoom: boolean;
  initialViewport: ModalViewportState | null;
}) => {
  const { containerRef, sceneId, sampleRef, effectiveZoom, initialViewport } =
    props;

  const sampleId = sampleRef.current?.sample?._id;
  const sampleData = sampleRef.current?.sample;

  const options = useModalLookerOptions();

  // Read activePaths directly from Jotai to bypass Recoil's filterPaths,
  // which strips newly created fields not yet in the GraphQL schema cache
  const jotaiActivePaths = useAtomValue(activeLabelSchemas);

  const zoomTarget = useMemo(
    () => (effectiveZoom && sampleData ? extractZoomTarget(sampleData) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveZoom]
  );

  // Frozen at mount time — the viewport init values are stable for the entire
  // lifetime of this component (scene is recreated when sceneId changes).
  const onInitializedRef = useRef<((scene: Scene2D) => void) | undefined>(
    undefined
  );
  if (!onInitializedRef.current) {
    onInitializedRef.current = (scene: Scene2D) => {
      if (initialViewport) {
        // Restores exact scale/pan snapshot before the first rendered frame —
        // no async prerequisites needed, so no reveal delay.
        scene.setViewportState(initialViewport);
      } else if (effectiveZoom && zoomTarget) {
        // Queues the two-gate zoom; fires lighter:viewport-initialized when done.
        scene.queueInitialZoom(zoomTarget, DEFAULT_ZOOM_PAD);
      }
    };
  }

  const onInitialized = useCallback(
    (scene: Scene2D) => onInitializedRef.current?.(scene),
    []
  );

  const mergedOptions = useMemo(
    () => ({
      ...options,
      activePaths: jotaiActivePaths ?? options.activePaths,
      onInitialized,
    }),
    [options, jotaiActivePaths, onInitialized]
  );

  const canvas = singletonCanvas.getCanvas(containerRef.current);

  const { scene } = useLighterSetupWithPixi(canvas, mergedOptions, sceneId);

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  useRetrieveViewport(scene, sampleId);

  return null;
};
