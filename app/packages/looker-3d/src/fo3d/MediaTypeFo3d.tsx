import { LoadingDots } from "@fiftyone/components";
import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { isInMultiPanelViewAtom, useBrowserStorage } from "@fiftyone/state";
import type { CameraControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import type * as THREE from "three";
import { Vector3 } from "three";
import { StatusBar } from "../StatusBar";
import { MultiPanelView } from "../annotation/MultiPanelView";
import { AnnotationToolbar } from "../annotation/annotation-toolbar/AnnotationToolbar";
import { useRenderModel } from "../annotation/store/renderModel";
import { PcdColorMapTunnel } from "../components/PcdColormapModal";
import {
  DEFAULT_BOUNDING_BOX,
  DEFAULT_CAMERA_POSITION,
  SET_EGO_VIEW_EVENT,
  SET_TOP_VIEW_EVENT,
  SET_ZOOM_TO_SELECTED_EVENT,
} from "../constants";
import { StatusBarRootContainer } from "../containers";
import {
  useFo3dCameraControlsConfig,
  useFo3dUpVector,
  useFo3d,
  useHotkey,
  useTrackStatus,
  useZoomToSelected,
} from "../hooks";
import { useFo3dBounds } from "../hooks/use-bounds";
import { useCursorBounds } from "../hooks/use-cursor-bounds";
import { useLabelBounds } from "../hooks/use-label-bounds";
import { useLoadingStatus } from "../hooks/use-loading-status";
import type { Looker3dSettings } from "../settings";
import {
  activeNodeAtom,
  annotationPlaneAtom,
  cameraPositionAtom,
  clearTransformStateSelector,
  currentHoveredPointAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidPointerDownAtom,
  isCurrentlyTransformingAtom,
  isFo3dBackgroundOnAtom,
  isSegmentingPointerDownAtom,
  selectedPolylineVertexAtom,
} from "../state";
import { useCurrent3dAnnotationMode } from "../state/accessors";
import type { HoverMetadata } from "../types";
import { Annotation3d } from "./Annotation3d";
import { Fo3dSceneContent } from "./Fo3dCanvas";
import HoverMetadataHUD from "./HoverMetadataHUD";
import { resolveCameraConfig, resolveViewConfig } from "./camera-init";
import { DEFAULT_RAYCAST_PRECISION, Fo3dSceneContext } from "./context";
import {
  getFo3dRoot,
  getMediaPathForFo3dSample,
  getSavedCameraState,
  saveCameraState,
} from "./utils";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

const MainContainer = styled.main`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

export const MediaTypeFo3dComponent = () => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const is2DSampleViewerVisible = useRecoilValue(
    fos.groupMediaIsMain2DViewerVisible
  );
  const isGroup = useRecoilValue(fos.isGroup);
  const setIsInMultiPanelView = useSetRecoilState(isInMultiPanelViewAtom);

  const settings = usePluginSettings<Looker3dSettings>("3d");

  const mediaPath = useMemo(
    () => getMediaPathForFo3dSample(sample, mediaField),
    [mediaField, sample]
  );

  const mode = useAtomValue(fos.modalMode);

  const mediaUrl = useMemo(() => fos.getSampleSrc(mediaPath), [mediaPath]);

  const fo3dRoot = useMemo(() => getFo3dRoot(sample.sample.filepath), [sample]);

  const { foScene, isLoading: isParsingFo3d } = useFo3d(
    mediaUrl,
    sample.sample.filepath,
    fo3dRoot
  );

  const [isSceneInitialized, setSceneInitialized] = useState(false);

  const numPrimaryAssets = useMemo(() => {
    if (!foScene) return 0;
    return foScene.children?.length ?? 0;
  }, [foScene]);

  const [upVector, setUpVectorVal] = useFo3dUpVector(
    foScene,
    settings.defaultUp
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const cameraControlsRef = useRef<CameraControls>();

  const datasetName = useRecoilValue(fos.datasetName);
  const canAnnotate = useCanAnnotate();
  const shouldRenderMultiPanelView = useMemo(
    () =>
      mode === "annotate" &&
      canAnnotate &&
      !(isGroup && is2DSampleViewerVisible) &&
      isSceneInitialized,
    [mode, isGroup, is2DSampleViewerVisible, isSceneInitialized, canAnnotate]
  );
  const currentRenderPath = shouldRenderMultiPanelView ? "multi" : "main";
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);

  useFo3dCameraControlsConfig({
    cameraControlsRef,
  });

  const assetsGroupRef = useRef<THREE.Group>();

  const loadingStatus = useLoadingStatus();

  // Ready when fo3d is parsed, foScene has assets, and all referenced assets are loaded
  const isReadyForBounds =
    Boolean(foScene) && !isParsingFo3d && loadingStatus.isSuccess;

  const {
    boundingBox: sceneBoundingBox,
    recomputeBounds,
    isComputing: isComputingSceneBoundingBox,
  } = useFo3dBounds(assetsGroupRef, isReadyForBounds, {
    numPrimaryAssets,
  });

  const effectiveSceneBoundingBox = sceneBoundingBox || DEFAULT_BOUNDING_BOX;

  const renderModel = useRenderModel();
  const labelBounds = useLabelBounds(renderModel);

  const cursorBounds = useCursorBounds(effectiveSceneBoundingBox, labelBounds);

  const lookAt = useMemo(
    () => effectiveSceneBoundingBox.getCenter(new Vector3()),
    [effectiveSceneBoundingBox]
  );

  const overriddenCameraPosition = useRecoilValue(cameraPositionAtom);

  // Default camera position for mounts/remounts. Prefer persisted position so
  // mode switches don't flash back to hardcoded defaults.
  const mountCameraPosition = useMemo(() => {
    const savedState = getSavedCameraState(datasetName);

    if (savedState?.position?.length === 3) {
      return new Vector3(
        savedState.position[0],
        savedState.position[1],
        savedState.position[2]
      );
    }

    return DEFAULT_CAMERA_POSITION();
  }, [datasetName, currentRenderPath]);

  const persistCurrentCameraState = useCallback(() => {
    if (!cameraRef.current || !cameraControlsRef.current) {
      return;
    }

    const target = new Vector3();
    cameraControlsRef.current.getTarget(target);
    saveCameraState(
      datasetName,
      cameraRef.current.position.toArray(),
      target.toArray()
    );
  }, [datasetName]);

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      (event: MouseEvent | null) => {
        // Don't handle right click since that might mean we're panning the camera
        if (event?.type === "contextmenu") {
          return;
        }

        if (isActivelySegmenting) {
          return;
        }

        set(activeNodeAtom, null);
        set(currentHoveredPointAtom, null);
        set(clearTransformStateSelector, null);
        set(selectedPolylineVertexAtom, null);
        set(isCurrentlyTransformingAtom, false);
        setAutoRotate(false);
      },
    [isActivelySegmenting]
  );

  useLayoutEffect(() => {
    const canvas = document.getElementById(CANVAS_WRAPPER_ID);

    if (canvas) {
      canvas.querySelector("canvas")?.setAttribute("canvas-loaded", "true");
    }
  }, [isSceneInitialized]);

  useEffect(() => {
    resetActiveNode(null);
  }, [isSceneInitialized, resetActiveNode]);

  // For user-triggered view changes (T/E keys).
  const onChangeView = useCallback(
    (
      view: "pov" | "top",
      { useAnimation = true }: { useAnimation?: boolean } = {}
    ) => {
      if (!cameraRef.current || !cameraControlsRef.current) {
        return;
      }

      const viewConfig = resolveViewConfig(view, {
        boundingBox: effectiveSceneBoundingBox,
        upVector,
        overriddenCameraPosition,
        scenePosition: foScene?.cameraProps.position ?? null,
        pluginSettings: settings,
      });

      cameraControlsRef.current.setLookAt(
        viewConfig.position.x,
        viewConfig.position.y,
        viewConfig.position.z,
        viewConfig.target.x,
        viewConfig.target.y,
        viewConfig.target.z,
        useAnimation
      );
    },
    [
      effectiveSceneBoundingBox,
      upVector,
      overriddenCameraPosition,
      foScene,
      settings,
    ]
  );

  fos.useEventHandler(window, SET_TOP_VIEW_EVENT, () => {
    const execute = () => {
      onChangeView("top", { useAnimation: true });
    };

    // Sometimes the bbox isn't computed yet, especially on scene load or error
    // for big assets, or because of timeout, or three.js loading manager issues,
    // so we lazily recompute it and try again shortly after.
    if (!sceneBoundingBox) {
      recomputeBounds();
      setTimeout(execute, 50);
    } else {
      execute();
    }
  });

  fos.useEventHandler(window, SET_EGO_VIEW_EVENT, () => {
    const execute = () => {
      onChangeView("pov", { useAnimation: true });
    };

    // Same lazy pattern is used here as above
    if (!sceneBoundingBox) {
      recomputeBounds();
      setTimeout(execute, 50);
    } else {
      execute();
    }
  });

  // Zoom to selected labels and use them as the new lookAt
  const handleZoomToSelected = useZoomToSelected({
    sample,
    upVector,
    mode,
    cameraControlsRef,
  });

  fos.useEventHandler(window, SET_ZOOM_TO_SELECTED_EVENT, handleZoomToSelected);

  // Restore camera at most once per render path.
  const restoredRenderPathRef = useRef<"main" | "multi" | null>(null);

  // Track whether bounds computation has ever started. This closes the timing gap
  // between isReadyForBounds becoming true and isComputingSceneBoundingBox flipping
  // to true (the useLayoutEffect in useFo3dBounds sets it, but there's a render
  // cycle gap where both are false — without this ref we'd prematurely fire fallback).
  const hasSeenBoundsComputingRef = useRef(false);
  if (isComputingSceneBoundingBox) {
    hasSeenBoundsComputingRef.current = true;
  }

  useEffect(() => {
    if (
      restoredRenderPathRef.current === currentRenderPath ||
      !cameraControlsRef.current ||
      !cameraRef.current ||
      !foScene
    ) {
      return;
    }

    const latestSavedCameraState = getSavedCameraState(datasetName);

    const config = resolveCameraConfig({
      savedState: latestSavedCameraState,
      overriddenCameraPosition,
      scenePosition: foScene.cameraProps.position,
      sceneLookAt: foScene.cameraProps.lookAt,
      pluginSettings: settings,
      boundingBox: sceneBoundingBox,
      upVector,
    });

    // For "fallback" source, wait until bbox pipeline has definitively resolved.
    // Higher-priority sources (savedState, operator, scene, plugin) can init immediately.
    // Bbox is resolved when: we got a result, there are no assets to measure, or
    // computation ran and finished (we saw isComputing go true, then false).
    const boundsResolved =
      sceneBoundingBox !== null ||
      numPrimaryAssets === 0 ||
      (isReadyForBounds &&
        !isComputingSceneBoundingBox &&
        hasSeenBoundsComputingRef.current);

    if (config.source === "fallback" && !boundsResolved) {
      return;
    }

    restoredRenderPathRef.current = currentRenderPath;

    cameraControlsRef.current.setLookAt(
      config.position.x,
      config.position.y,
      config.position.z,
      config.target.x,
      config.target.y,
      config.target.z,
      false
    );

    setSceneInitialized(true);
  }, [
    foScene,
    currentRenderPath,
    datasetName,
    overriddenCameraPosition,
    settings,
    sceneBoundingBox,
    upVector,
    isComputingSceneBoundingBox,
    isReadyForBounds,
    numPrimaryAssets,
  ]);

  // Post-init override: animates to new position when operator sets cameraPositionAtom AFTER init
  const prevOverrideRef = useRef(overriddenCameraPosition);

  useEffect(() => {
    // Only fire when overriddenCameraPosition actually changes, not on mount/init
    if (prevOverrideRef.current === overriddenCameraPosition) {
      prevOverrideRef.current = overriddenCameraPosition;
      return;
    }
    prevOverrideRef.current = overriddenCameraPosition;

    if (!cameraControlsRef.current || !overriddenCameraPosition?.length) {
      return;
    }

    cameraControlsRef.current.setLookAt(
      overriddenCameraPosition[0],
      overriddenCameraPosition[1],
      overriddenCameraPosition[2],
      0,
      0,
      0,
      true
    );
  }, [overriddenCameraPosition]);

  useTrackStatus();

  const setUpVector = useCallback((upVector: Vector3) => {
    setUpVectorVal(upVector);
  }, []);

  const [autoRotate, setAutoRotate] = useBrowserStorage(
    "fo3dAutoRotate",
    false
  );

  const [pointCloudSettings, setPointCloudSettings] = useBrowserStorage(
    "fo3d-pointCloudSettings",
    {
      enableTooltip: false,
    }
  );

  const [raycastPrecision, setRaycastPrecision] = useBrowserStorage(
    "fo3d-raycastingPrecision",
    DEFAULT_RAYCAST_PRECISION
  );

  const [hoverMetadata, setHoverMetadata] = useState<HoverMetadata | null>(
    null
  );

  const isAnnotationPlaneEnabled = useRecoilValue(annotationPlaneAtom).enabled;

  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const isPolylineAnnotateActive = current3dAnnotationMode === "polyline";
  const isCuboidAnnotateActive = current3dAnnotationMode === "cuboid";

  // This effect persists camera state on unmount, which includes when switching render paths since the component doesn't remount.
  useEffect(() => {
    return () => {
      persistCurrentCameraState();
    };
  }, [currentRenderPath, persistCurrentCameraState]);

  // This effect recomputes bounds when toggling multi-panel view or annotation plane, since both can change the visible assets and thus the appropriate bounding box.
  useEffect(() => {
    if (shouldRenderMultiPanelView) {
      recomputeBounds();
    }
  }, [shouldRenderMultiPanelView, isAnnotationPlaneEnabled, recomputeBounds]);

  useEffect(() => {
    setIsInMultiPanelView(shouldRenderMultiPanelView);
  }, [shouldRenderMultiPanelView]);

  if (isParsingFo3d) {
    return <LoadingDots />;
  }

  return (
    <Fo3dSceneContext.Provider
      value={{
        isSceneInitialized,
        numPrimaryAssets,
        upVector,
        setUpVector,
        isComputingSceneBoundingBox,
        fo3dRoot,
        sceneBoundingBox: effectiveSceneBoundingBox,
        cursorBounds,
        lookAt,
        autoRotate,
        setAutoRotate,
        pointCloudSettings,
        setPointCloudSettings,
        raycastPrecision,
        setRaycastPrecision,
        hoverMetadata,
        setHoverMetadata,
        pluginSettings: settings,
      }}
    >
      {canAnnotate && <Annotation3d />}
      {shouldRenderMultiPanelView ? (
        <MultiPanelView
          key={upVector ? upVector.toArray().join(",") : null}
          assetsGroupRef={assetsGroupRef}
          foScene={foScene}
          sample={sample}
          cameraRef={cameraRef}
          cameraControlsRef={cameraControlsRef}
          defaultCameraPosition={mountCameraPosition}
        />
      ) : (
        <MainContainer ref={containerRef}>
          <HoverMetadataHUD />
          <PcdColorMapTunnel.Out />
          <Canvas
            id={CANVAS_WRAPPER_ID}
            eventSource={containerRef}
            onPointerMissed={resetActiveNode}
            key={upVector ? upVector.toArray().join(",") : null}
          >
            <Fo3dSceneContent
              cameraPosition={mountCameraPosition}
              upVector={upVector}
              fov={foScene?.cameraProps.fov ?? 50}
              isGizmoHelperVisible={true}
              near={foScene?.cameraProps.near ?? 0.1}
              far={foScene?.cameraProps.far ?? 2500}
              aspect={foScene?.cameraProps.aspect ?? 1}
              autoRotate={autoRotate}
              cameraControlsRef={cameraControlsRef}
              foScene={foScene}
              isSceneInitialized={isSceneInitialized}
              sample={sample}
              pointCloudSettings={pointCloudSettings}
              assetsGroupRef={assetsGroupRef}
              cameraRef={cameraRef}
            />
          </Canvas>
          <StatusBarRootContainer>
            <StatusBar cameraRef={cameraRef} />
          </StatusBarRootContainer>
        </MainContainer>
      )}
      {mode === "annotate" &&
        (isPolylineAnnotateActive || isCuboidAnnotateActive) && (
          <AnnotationToolbar />
        )}
    </Fo3dSceneContext.Provider>
  );
};
