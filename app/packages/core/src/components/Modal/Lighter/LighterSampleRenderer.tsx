/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  ImageOptions,
  ImageOverlay,
  lighterInitErrorAtom,
  overlayFactory,
  useLighterSetupWithPixi,
  useViewportInitReveal,
} from "@fiftyone/lighter";
import type { ModalSample } from "@fiftyone/state";
import { getSampleSrc, useModalLookerOptions } from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { activeLabelSchemas } from "../Sidebar/Annotate/state";
import { LighterToolbar } from "./LighterToolbar";
import styles from "./LighterSampleRenderer.module.css";
import { singletonCanvas } from "./SharedCanvas";
import { useBridge } from "./useBridge";
import { useExposeMediaBoundsForTest } from "./useExposeMediaBoundsForTest";
import useRetrieveViewport from "./useRetrieveViewport";
import useViewport from "./useViewport";

const GpuErrorAnimation = lazy(() => import("./GpuErrorAnimation"));

export interface LighterSampleRendererProps {
  /** Custom CSS class name */
  className?: string;
  /** Sample to display */
  sample: ModalSample;
  /** Notified when the scene becomes safe to show (initial viewport settled
   * on-canvas) — lets a host drive a loading cover over this renderer. */
  onRevealChange?: (revealed: boolean) => void;
}

/**
 * Lighter unit sample renderer with PixiJS renderer.
 */
export const LighterSampleRenderer = ({
  className = "",
  sample,
  onRevealChange,
}: LighterSampleRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // unique scene id allows us to destroy/recreate scenes reliably
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [isCanvasHovered, setIsCanvasHovered] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const initError = useAtomValue(lighterInitErrorAtom);
  const setInitError = useSetAtom(lighterInitErrorAtom);

  // use a ref for the sample data, effects do not run solely because the
  // sample changed
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  const onReveal = useCallback(() => setIsRevealed(true), []);

  useEffect(() => {
    // An init failure renders the error panel in place of the scene and no
    // reveal ever fires — report it as "revealed" so a host's loading cover
    // drops and the panel is visible instead of an indefinite spinner.
    onRevealChange?.(isRevealed || initError !== null);
  }, [isRevealed, initError, onRevealChange]);

  useEffect(() => {
    // sceneId should be deterministic, but unique for a given sample snapshot
    const sample = sampleRef.current;
    setSceneId(
      `${sample?.sample?._id}-${sample?.sample?.last_modified_at?.datetime}`,
    );
  }, []);

  useEffect(() => {
    // clear a stale global init error on mount so a prior failure doesn't
    // permanently lock later valid loads out of the renderer
    setInitError(null);
  }, [setInitError]);

  if (initError) {
    return (
      <div className={styles.errorPanel} role="alert" aria-live="assertive">
        <Suspense fallback={null}>
          <GpuErrorAnimation />
        </Suspense>
        <p className={styles.errorTitle}>WebGL context could not be created</p>
        <p className={styles.errorMessage}>
          This is usually caused by an incompatible GPU driver or a browser flag
          blocking hardware acceleration.
        </p>
      </div>
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
  sampleRef: React.RefObject<ModalSample>;
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

  const revealed = useViewportInitReveal(scene);
  useEffect(() => {
    if (revealed) {
      onReveal();
    }
  }, [revealed, onReveal]);

  useExposeMediaBoundsForTest(scene);

  useViewport(sampleId);

  // This is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  useRetrieveViewport(scene, sampleId);

  return null;
};
