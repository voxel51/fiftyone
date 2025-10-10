/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import {
  ImageOptions,
  ImageOverlay,
  overlayFactory,
  useLighter,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { loadOverlays } from "@fiftyone/looker/src/overlays";
import DetectionOverlay from "@fiftyone/looker/src/overlays/detection";
import * as fos from "@fiftyone/state";
import {
  fieldSchema,
  getSampleSrc,
  Sample,
  State,
  useAssertedRecoilValue,
} from "@fiftyone/state";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { singletonCanvas } from "./SharedCanvas";
import { convertLegacyToLighterDetection } from "./looker-lighter-bridge";
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
export const LighterSampleRenderer: React.FC<LighterSampleRendererProps> = ({
  className = "",
  sample,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // we have this hack to force a re-render on layout effect, so that containerRef.current is defined
  // this is to allow stable singleton canvas to bind to new containers
  const [, setReTrigger] = useState(0);

  useLayoutEffect(() => {
    setReTrigger((prev) => prev + 1);
  }, []);

  // Get access to the lighter instance
  const { scene, isReady, addOverlay } = useLighter();

  const schema = useAssertedRecoilValue(
    fieldSchema({ space: State.SPACE.SAMPLE })
  );

  /**
   * This effect is responsible for loading the sample and adding the overlays to the scene.
   */
  useEffect(() => {
    if (!isReady || !scene) return;

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

    const overlays = loadOverlays(sample.sample, schema, false);

    for (const overlay of overlays) {
      if (overlay instanceof DetectionOverlay) {
        // Convert legacy overlay to lighter overlay with relative coordinates
        const lighterOverlay = convertLegacyToLighterDetection(
          overlay,
          sample.id
        );
        addOverlay(lighterOverlay, false);
      }
    }

    return () => {
      scene.destroy();
    };
  }, [isReady, addOverlay, sample, scene, schema]);

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
      {containerRef.current && <LighterSetupImpl containerRef={containerRef} />}
    </div>
  );
};

const LighterSetupImpl = (props: {
  containerRef: React.RefObject<HTMLDivElement>;
}) => {
  const { containerRef } = props;

  const options = useRecoilValue(
    fos.lookerOptions({ modal: true, withFilter: false })
  );

  const canvas = singletonCanvas.getCanvas(containerRef.current!);

  const { scene } = useLighterSetupWithPixi(canvas, options);

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  return null;
};
