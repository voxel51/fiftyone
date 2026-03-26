/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  ImageOptions,
  ImageOverlay,
  KeypointOptions,
  KeypointOverlay,
  overlayFactory,
  useLighter,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import type { ModalViewportState, Sample } from "@fiftyone/state";
import { getSampleSrc, useModalLookerOptions } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { activeLabelSchemas } from "../Sidebar/Annotate/state";
import { extractZoomTarget } from "./utils";
import { LighterToolbar } from "./LighterToolbar";
import { singletonCanvas } from "./SharedCanvas";
import { useBridge } from "./useBridge";
import useDeferShow from "./useDeferShow";
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
  const { effectiveZoom, initialViewport } = useDeferShow(sampleId);

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
          deferShow: effectiveZoom,
        }
      );
      addOverlay(mediaOverlay, false);

      // Set the image overlay as canonical media for coordinate transformations
      scene.setCanonicalMedia(mediaOverlay);

      // TODO: REMOVE — hardcoded test keypoints for visual verification
      // const testKeypoints = overlayFactory.create<
      //   KeypointOptions,
      //   KeypointOverlay
      // >("keypoint", {
      //   id: "test-keypoints-skeleton",
      //   field: "",
      //   label: {
      //     _id: "test-kp-1",
      //     label: "person",
      //     tags: [],
      //     points: [
      //       [0.3, 0.2], // head
      //       [0.3, 0.4], // torso
      //       [0.2, 0.35], // left hand
      //       [0.4, 0.35], // right hand
      //       [0.25, 0.6], // left foot
      //       [0.35, 0.6], // right foot
      //     ],
      //   },
      //   connections: [
      //     [0, 1],    // head → torso
      //     [2, 1, 3], // left hand → torso → right hand
      //     [4, 1, 5], // left foot → torso → right foot
      //   ],
      //   closed: false,
      // });
      // addOverlay(testKeypoints, false);

      // const testPoints = overlayFactory.create<
      //   KeypointOptions,
      //   KeypointOverlay
      // >("keypoint", {
      //   id: "test-keypoints-points-only",
      //   field: "",
      //   label: {
      //     _id: "test-kp-2",
      //     label: "prompts",
      //     tags: [],
      //     points: [
      //       [0.6, 0.3],
      //       [0.7, 0.5],
      //       [0.65, 0.7],
      //     ],
      //   },
      //   // No connections — just individual points
      // });
      // addOverlay(testPoints, false);

      // const testPolygon = overlayFactory.create<
      //   KeypointOptions,
      //   KeypointOverlay
      // >("keypoint", {
      //   id: "test-keypoints-polygon",
      //   field: "",
      //   label: {
      //     _id: "test-kp-3",
      //     label: "ROI",
      //     tags: [],
      //     points: [
      //       [0.5, 0.1],
      //       [0.9, 0.1],
      //       [0.9, 0.4],
      //       [0.5, 0.4],
      //     ],
      //   },
      //   connections: [[0, 1, 2, 3]],
      //   closed: true,
      // });
      // addOverlay(testPolygon, false);
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
  const { containerRef, sceneId, sampleRef, effectiveZoom, initialViewport } = props;

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

  const mergedOptions = useMemo(
    () => ({
      ...options,
      activePaths: jotaiActivePaths ?? options.activePaths,
      zoom: effectiveZoom,
      zoomTarget,
      initialViewport,
    }),
    [options, jotaiActivePaths, effectiveZoom, zoomTarget, initialViewport]
  );

  const canvas = singletonCanvas.getCanvas(containerRef.current);

  const { scene } = useLighterSetupWithPixi(
    canvas,
    mergedOptions,
    sceneId,
  );

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  useRetrieveViewport(scene, sampleId);

  return null;
};
