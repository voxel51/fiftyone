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
import React, { useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { ImageOptions, ImageOverlay, overlayFactory } from "../index";
import { useLighter, useLighterSetupWithPixi } from "./index";
import { convertLegacyToLighterDetection } from "./looker-lighter-bridge";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const options = useRecoilValue(
    fos.lookerOptions({ modal: true, withFilter: false })
  );

  useLighterSetupWithPixi(canvasRef, options);

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
      addOverlay(mediaOverlay);

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
        addOverlay(lighterOverlay);
      }
    }

    return () => {
      scene.destroy();
    };
  }, [isReady, addOverlay, sample, scene, schema]);

  return (
    <div
      className={`lighter-sample-renderer ${className}`}
      data-cy="lighter-sample-renderer"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <canvas
        ref={canvasRef}
        data-cy="lighter-sample-renderer-canvas"
        style={{
          display: "block",
          flex: 1,
        }}
      />
    </div>
  );
};
