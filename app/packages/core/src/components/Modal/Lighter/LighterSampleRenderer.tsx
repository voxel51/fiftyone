/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  ImageOptions,
  ImageOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  lighterInitErrorAtom,
  overlayFactory,
  useLighterEventHandler,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import type { Sample } from "@fiftyone/state";
import { getSampleSrc, useModalLookerOptions } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import Lottie from "lottie-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { activeLabelSchemas } from "../Sidebar/Annotate/state";
import gpuErrorAnimation from "./assets/gpu-error.json";
import { LighterToolbar } from "./LighterToolbar";
import { singletonCanvas } from "./SharedCanvas";
import { useBridge } from "./useBridge";
import useRetrieveViewport from "./useRetrieveViewport";
import useViewport from "./useViewport";

const ErrorPanel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
  color: ${({ theme }) => theme.text.secondary};
`;

const ErrorTitle = styled.p`
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: ${({ theme }) => theme.text.primary};
`;

const ErrorMessage = styled.p`
  margin: 0;
  font-size: 0.825rem;
  color: ${({ theme }) => theme.text.secondary};
  max-width: 360px;
  line-height: 1.5;
`;

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

  const initError = useAtomValue(lighterInitErrorAtom);

  // use a ref for the sample data, effects do not run solely because the
  // sample changed
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  const onReveal = useCallback(() => setIsRevealed(true), []);

  useEffect(() => {
    // sceneId should be deterministic, but unique for a given sample snapshot
    const sample = sampleRef.current;
    setSceneId(
      `${sample?.sample?._id}-${sample?.sample?.last_modified_at?.datetime}`,
    );
  }, []);

  if (initError) {
    return (
      <ErrorPanel>
        <Lottie
          animationData={gpuErrorAnimation}
          loop
          style={{ width: 220, height: 220 }}
        />
        <ErrorTitle>WebGL context could not be created</ErrorTitle>
        <ErrorMessage>
          This is usually caused by an incompatible GPU driver or a browser
          flag blocking hardware acceleration.
        </ErrorMessage>
      </ErrorPanel>
    );
  }

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
    [options, jotaiActivePaths],
  );

  const canvas = singletonCanvas.getCanvas(containerRef.current ?? undefined);

  const { scene } = useLighterSetupWithPixi(canvas, mergedOptions, sceneId);

  // Add the canonical image overlay to the scene that belongs to *this* mount.
  // The identity guard prevents firing against a stale scene that the
  // lighterSceneAtom may still hold from a previous mount
  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) return;

    const sample = sampleRef.current;
    const mediaUrl =
      sample.urls.length > 0 && sample.urls[0].url
        ? getSampleSrc(sample.urls[0].url)
        : null;

    if (!mediaUrl) return;

    const mediaOverlay = overlayFactory.create<ImageOptions, ImageOverlay>(
      "image",
      {
        src: mediaUrl,
        maintainAspectRatio: true,
      },
    );
    scene.addOverlay(mediaOverlay);

    // Set the image overlay as canonical media for coordinate transformations
    scene.setCanonicalMedia(mediaOverlay);
  }, [scene, sceneId]);

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  useEventHandler("lighter:viewport-init-complete", onReveal, { once: true });

  useViewport(sampleId);

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  useRetrieveViewport(scene, sampleId);

  return null;
};
