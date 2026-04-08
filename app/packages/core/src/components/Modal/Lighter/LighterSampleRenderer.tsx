/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  ImageOptions,
  ImageOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  overlayFactory,
  useLighter,
  useLighterEventHandler,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import type { Sample } from "@fiftyone/state";
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
import { LighterToolbar } from "./LighterToolbar";
import { singletonCanvas } from "./SharedCanvas";
import { useBridge } from "./useBridge";
import useRetrieveViewport from "./useRetrieveViewport";
import useViewport from "./useViewport";

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
  const [isRevealed, setIsRevealed] = useState(false);

  const { scene, isReady, addOverlay } = useLighter();

  // use a ref for the sample data, effects do not run solely because the
  // sample changed
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  const onReveal = useCallback(() => setIsRevealed(true), []);

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
          onReveal={onReveal}
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
  onReveal: () => void;
}) => {
  const { containerRef, sceneId, sampleRef, onReveal } = props;

  const sampleId = sampleRef.current?.sample?._id;

  const options = useModalLookerOptions();

  // Read activePaths directly from Jotai to bypass Recoil's filterPaths,
  // which strips newly created fields not yet in the GraphQL schema cache
  const jotaiActivePaths = useAtomValue(activeLabelSchemas);

  const mergedOptions = useMemo(
    () => ({
      ...options,
      activePaths: jotaiActivePaths ?? options.activePaths,
    }),
    [options, jotaiActivePaths]
  );

  const canvas = singletonCanvas.getCanvas(containerRef.current ?? undefined);

  const { scene } = useLighterSetupWithPixi(canvas, mergedOptions, sceneId);

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  useEventHandler(
    "lighter:viewport-init-complete",
    useCallback(() => onReveal(), [onReveal]),
    { once: true }
  );

  useViewport(sampleId);

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  useRetrieveViewport(scene, sampleId);

  return null;
};
