/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

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
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import { ImageOptions, ImageOverlay, overlayFactory } from "../index";
import { useLighter, useLighterSetup } from "./index";
import { convertLegacyToLighterDetection } from "./looker-lighter-bridge";

/**
 * Props for the LighterSampleRenderer component.
 */
export interface LighterSampleRendererProps {
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Custom CSS class name */
  className?: string;
  /** Sample to display */
  sample: Sample;
}

/**
 * Example of using the useLighter hook with optional custom renderer and resource loader.
 * This component demonstrates using the OverlayFactory to create overlays instead of direct instantiation.
 */
export const LighterSampleRenderer: React.FC<LighterSampleRendererProps> = ({
  width,
  height,
  className = "",
  sample,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: width || 0,
    height: height || 0,
  });

  const options = useRecoilValue(
    fos.lookerOptions({ modal: true, withFilter: false })
  );

  // Setup the lighter instance
  useLighterSetup(canvasRef, options);

  // Get access to the lighter instance
  const { scene, isReady, addOverlay } = useLighter();

  // Get actual canvas dimensions from parent container
  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const { width: actualWidth, height: actualHeight } =
      canvas.parentElement!.getBoundingClientRect();
    setCanvasDimensions({ width: actualWidth, height: actualHeight });
  }, [canvasRef]);

  const schema = useAssertedRecoilValue(
    fieldSchema({ space: State.SPACE.SAMPLE })
  );

  useEffect(() => {
    if (isReady && scene) {
      const mediaUrl =
        sample.urls.length > 0 ? getSampleSrc(sample.urls[0].url!) : null;

      if (mediaUrl) {
        const mediaOverlay = overlayFactory.create<ImageOptions, ImageOverlay>(
          "image",
          {
            src: mediaUrl,
            maintainAspectRatio: true,
          }
        );
        addOverlay(mediaOverlay);

        // Set the image overlay as canonical media for coordinate transformations
        scene.setCanonicalMedia(mediaOverlay);
      }

      // Load and add overlays from the sample
      const overlays = loadOverlays(sample.sample, schema, false);

      for (const overlay of overlays) {
        if (overlay instanceof DetectionOverlay) {
          // Convert legacy overlay to lighter overlay with relative coordinates
          const lighterOverlay = convertLegacyToLighterDetection(overlay);
          addOverlay(lighterOverlay);
        }
      }
    }
  }, [isReady, addOverlay, sample, scene, schema]); // Add scene and schema to dependencies

  return (
    <div
      className={`lighter-sample-renderer ${className}`}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          flex: 1,
        }}
      />
    </div>
  );
};
