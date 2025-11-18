/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import type { ImageOptions, ImageOverlay, SceneAtom } from "@fiftyone/lighter";
import {
  defaultLighterSceneAtom,
  overlayFactory,
  useLighter,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import type { Sample } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { getSampleSrc } from "@fiftyone/state";
import type { RefObject } from "react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { defaultCanvas } from "./ReusableCanvas";
import { useBridge } from "./useBridge";

export interface LighterSampleRendererProps {
  /** Scene atom */
  atom: SceneAtom;
  /** Custom CSS class name */
  className?: string;
  /** Sample to display */
  sample: Sample;
}

/**
 * Lighter unit sample renderer with PixiJS renderer.
 */
export const LighterSampleRenderer = ({
  atom = defaultLighterSceneAtom,
  className = "",
  sample,
}: LighterSampleRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // we have this hack to force a re-render on layout effect, so that containerRef.current is defined
  // this is to allow stable singleton canvas to bind to new containers
  const [, setReTrigger] = useState(0);

  useLayoutEffect(() => {
    setReTrigger((prev) => prev + 1);
  }, []);

  // Get access to the lighter instance
  const { scene, isReady, addOverlay } = useLighter(atom);

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
      {containerRef.current && (
        <LighterSetupImpl atom={atom} containerRef={containerRef} />
      )}
    </div>
  );
};

const LighterSetupImpl = (props: {
  atom: SceneAtom;
  containerRef: RefObject<HTMLDivElement>;
}) => {
  const { atom, containerRef } = props;

  const options = useRecoilValue(
    fos.lookerOptions({ modal: true, withFilter: false })
  );

  const canvas = defaultCanvas.getCanvas(containerRef.current);

  const { scene } = useLighterSetupWithPixi(canvas, options, atom);

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  return null;
};
