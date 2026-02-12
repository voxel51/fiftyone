/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  ImageOptions,
  ImageOverlay,
  overlayFactory,
  useLighter,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import type { Sample } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { getSampleSrc } from "@fiftyone/state";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { singletonCanvas } from "./SharedCanvas";
import { useBridge } from "./useBridge";

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

  // we have this hack to force a re-render on layout effect, so that containerRef.current is defined
  // this is to allow stable singleton canvas to bind to new containers
  const [, setReTrigger] = useState(0);

  useLayoutEffect(() => {
    setReTrigger((prev) => prev + 1);
  }, []);

  // Get access to the lighter instance
  const { scene, isReady, addOverlay } = useLighter();

  // use a ref for the sample data, effects do not run solely because the
  // sample changed
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

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
      className={`lighter-sample-renderer ${className}`}
      data-cy="lighter-sample-renderer"
      id="lighter-sample-renderer-container"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {containerRef.current && sceneId && (
        <LighterSetupImpl containerRef={containerRef} sceneId={sceneId} />
      )}
    </div>
  );
};

const LighterSetupImpl = (props: {
  containerRef: React.RefObject<HTMLDivElement>;
  sceneId: string;
}) => {
  const { containerRef, sceneId } = props;

  const options = useRecoilValue(
    fos.lookerOptions({ modal: true, withFilter: false })
  );

  const canvas = singletonCanvas.getCanvas(containerRef.current);

  const { scene } = useLighterSetupWithPixi(canvas, options, sceneId);

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene, sceneId);

  return null;
};
