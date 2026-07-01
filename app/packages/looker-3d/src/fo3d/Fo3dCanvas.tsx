import * as fos from "@fiftyone/state";
import {
  AdaptiveDpr,
  AdaptiveEvents,
  OrbitControls,
  PerspectiveCamera as PerspectiveCameraDrei,
} from "@react-three/drei";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type * as THREE from "three";
import type { Vector3 } from "three";
import { SpinningCube } from "../SpinningCube";
import { AnnotationPlane } from "../annotation/AnnotationPlane";
import { CreateCuboidRenderer } from "../annotation/CreateCuboidRenderer";
import { Crosshair3D } from "../annotation/Crosshair3D";
import { SegmentPolylineRenderer } from "../annotation/SegmentPolylineRenderer";
import { PANEL_ID_MAIN } from "../constants";
import { FrustumCollection } from "../frustum";
import { useCameraViews } from "../hooks/use-camera-views";
import { ThreeDLabels } from "../labels";
import { RaycastService } from "../services/RaycastService";
import { useMainPanelNavigationSyncEmitterState } from "../state";
import type { Fo3dCameraControls } from "./camera-controls";
import { useFo3dContext } from "./context";
import { Fo3dPerformanceMonitor } from "./Fo3dPerformanceMonitor";
import { FoSceneComponent } from "./FoScene";
import { Gizmos } from "./Gizmos";
import { FoScene } from "./render-types";
import { SceneControls } from "./scene-controls/SceneControls";
import {
  createMainPanelPanSyncIntent,
  createMainPanelZoomSyncIntent,
  MAIN_PANEL_PAN_SYNC_INTERVAL_MS,
  MAIN_PANEL_PAN_SYNC_TARGET_EPSILON_SQ,
  MAIN_PANEL_ORBIT_ZOOM_SPEED,
} from "../utils/side-panel-camera-sync";
import {
  MAIN_PANEL_CAMERA_TARGET_EPSILON,
  MAIN_PANEL_ORBIT_PAN_SPEED,
  syncMainPanelOrbitControls,
} from "../utils/main-panel-orbit-controls";

interface Fo3dSceneContentProps {
  /**
   * Camera position
   */
  cameraPosition: Vector3;
  /**
   * Up vector for the camera
   */
  upVector: Vector3 | null;
  /**
   * Camera field of view
   */
  fov?: number;
  /**
   * Camera near plane
   */
  near?: number;
  /**
   * Camera far plane
   */
  far?: number;
  /**
   * Camera aspect ratio
   */
  aspect?: number;
  /**
   * Whether auto-rotate is enabled
   */
  autoRotate: boolean;
  /**
   * Reference to camera controls
   */
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
  /**
   * The 3D scene to render
   */
  foScene: FoScene;
  /**
   * Whether the scene is initialized
   */
  isSceneInitialized: boolean;
  /**
   * Reference to the assets group
   */
  assetsGroupRef: React.RefObject<THREE.Group>;
  /**
   * Reference to camera
   */
  cameraRef?: React.RefObject<THREE.PerspectiveCamera>;
  /**
   * Whether or not to render gizmo helper.
   */
  isGizmoHelperVisible?: boolean;
}

export const Fo3dSceneContent = ({
  cameraPosition,
  upVector,
  fov = 50,
  near = 0.1,
  far = 2500,
  aspect = 1,
  autoRotate,
  cameraControlsRef,
  foScene,
  isSceneInitialized,
  isGizmoHelperVisible,
  assetsGroupRef,
  cameraRef,
}: Fo3dSceneContentProps) => {
  const mode = useAtomValue(fos.modalMode);
  const { activeSampleMap: labelSampleMap } = fos.useRenderConfig3dState();

  useCameraViews({
    cameraRef,
    cameraControlsRef,
  });

  return (
    <>
      <RaycastService panelId={PANEL_ID_MAIN} />
      <MainPanelNavigationSyncEmitter
        cameraControlsRef={cameraControlsRef}
        cameraRef={cameraRef}
      />
      <Fo3dPerformanceMonitor />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />

      <PerspectiveCameraDrei
        makeDefault
        ref={cameraRef as React.MutableRefObject<THREE.PerspectiveCamera>}
        position={cameraPosition}
        up={upVector ?? [0, 1, 0]}
        fov={foScene?.cameraProps.fov ?? fov}
        near={foScene?.cameraProps.near ?? near}
        far={foScene?.cameraProps.far ?? far}
        aspect={foScene?.cameraProps.aspect ?? aspect}
        onUpdate={(cam) => cam.updateProjectionMatrix()}
      />

      <OrbitControls
        ref={cameraControlsRef}
        makeDefault
        autoRotate={autoRotate}
        enableDamping={false}
        rotateSpeed={1}
        zoomSpeed={MAIN_PANEL_ORBIT_ZOOM_SPEED}
        panSpeed={MAIN_PANEL_ORBIT_PAN_SPEED}
        minDistance={MAIN_PANEL_CAMERA_TARGET_EPSILON}
        zoomToCursor
      />
      <MainPanelOrbitControlsSync cameraControlsRef={cameraControlsRef} />

      <SceneControls scene={foScene} cameraControlsRef={cameraControlsRef} />

      <Gizmos
        isGizmoHelperVisible={isGizmoHelperVisible}
        isGridVisible={true}
      />
      {!isSceneInitialized && <SpinningCube />}

      <group ref={assetsGroupRef} visible={isSceneInitialized}>
        <FoSceneComponent scene={foScene} />
      </group>

      {isSceneInitialized && <ThreeDLabels sampleMap={labelSampleMap} />}
      <FrustumCollection isSceneInitialized={isSceneInitialized} />

      {mode === fos.ModalMode.ANNOTATE && <AnnotationControls />}
    </>
  );
};

const MainPanelOrbitControlsSync = ({
  cameraControlsRef,
}: {
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
}) => {
  const { sceneBoundingBox } = useFo3dContext();

  const syncControls = useCallback(() => {
    const controls = cameraControlsRef.current;
    if (!controls) {
      return;
    }

    syncMainPanelOrbitControls({
      controls,
      sceneBoundingBox,
    });
  }, [cameraControlsRef, sceneBoundingBox]);

  // This effect syncs the OrbitControls config (zoom/pan speed, min distance)
  // once when the callback changes, then keeps it in sync on every "change"
  // event (zoom/pan/rotate). It re-runs when the controls ref or scene bounding
  // box changes (both fold into the syncControls identity).
  useEffect(() => {
    const controls = cameraControlsRef.current;
    if (!controls) {
      return undefined;
    }

    syncControls();
    controls.addEventListener("change", syncControls);

    return () => {
      controls.removeEventListener("change", syncControls);
    };
  }, [cameraControlsRef, syncControls]);

  return null;
};

const MainPanelNavigationSyncEmitter = ({
  cameraControlsRef,
  cameraRef,
}: {
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
  cameraRef?: React.RefObject<THREE.PerspectiveCamera>;
}) => {
  const {
    activeCursorPanel,
    raycastResult,
    setMainPanelPanSyncIntent,
    setMainPanelZoomSyncIntent,
  } = useMainPanelNavigationSyncEmitterState();
  const activeCursorPanelRef = useRef(activeCursorPanel);
  const isMainPanelPointerDragRef = useRef(false);
  const lastControlsTargetRef = useRef<THREE.Vector3 | null>(null);
  const lastPanIntentAtRef = useRef(0);
  const raycastResultRef = useRef(raycastResult);
  const sequenceRef = useRef(0);

  // This effect keeps a ref in sync with the active cursor panel so the
  // window event handlers / render loop can read the latest value without
  // having to re-subscribe their listeners.
  useEffect(() => {
    activeCursorPanelRef.current = activeCursorPanel;
  }, [activeCursorPanel]);

  // This effect keeps a ref in sync with the latest raycast result so the
  // window event handlers / render loop can read it without re-subscribing.
  useEffect(() => {
    raycastResultRef.current = raycastResult;
  }, [raycastResult]);

  // This effect subscribes to window wheel events and emits a zoom sync
  // intent so other panels can mirror the main panel's wheel zoom.
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const timestamp = Date.now();
      const intent = createMainPanelZoomSyncIntent({
        activeCursorPanel: activeCursorPanelRef.current,
        camera: cameraRef?.current ?? undefined,
        deltaY: event.deltaY,
        id: `${timestamp}-${sequenceRef.current++}`,
        raycastResult: raycastResultRef.current,
        timestamp,
        zoomSpeed: cameraControlsRef.current?.zoomSpeed,
      });

      if (intent) {
        setMainPanelZoomSyncIntent(intent);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [cameraControlsRef, cameraRef, setMainPanelZoomSyncIntent]);

  // This effect tracks pointer drag state on the main panel via window
  // pointer/blur events, capturing the controls target at drag start so the
  // pan sync handler below can detect main-panel-driven panning.
  useEffect(() => {
    const handlePointerDown = () => {
      isMainPanelPointerDragRef.current =
        activeCursorPanelRef.current === PANEL_ID_MAIN;
      lastControlsTargetRef.current =
        cameraControlsRef.current?.target?.clone() ?? null;
    };
    const handlePointerUp = () => {
      isMainPanelPointerDragRef.current = false;
      lastControlsTargetRef.current = null;
    };

    window.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("blur", handlePointerUp);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
    };
  }, [cameraControlsRef]);

  // This effect subscribes to OrbitControls "change" events to detect
  // main-panel pan gestures and emit throttled pan sync intents so other
  // panels can mirror the main panel's pan.
  useEffect(() => {
    const controls = cameraControlsRef.current;
    if (!controls) {
      return undefined;
    }

    const handleControlsChange = () => {
      const currentTarget = controls.target;
      const previousTarget = lastControlsTargetRef.current;
      lastControlsTargetRef.current = currentTarget.clone();

      if (
        !isMainPanelPointerDragRef.current ||
        !previousTarget ||
        previousTarget.distanceToSquared(currentTarget) <=
          MAIN_PANEL_PAN_SYNC_TARGET_EPSILON_SQ
      ) {
        return;
      }

      const timestamp = Date.now();
      if (
        timestamp - lastPanIntentAtRef.current <
        MAIN_PANEL_PAN_SYNC_INTERVAL_MS
      ) {
        return;
      }

      const intent = createMainPanelPanSyncIntent({
        id: `${timestamp}-${sequenceRef.current++}`,
        isMainPanelPointerDrag: isMainPanelPointerDragRef.current,
        raycastResult: raycastResultRef.current,
        timestamp,
      });

      if (intent) {
        lastPanIntentAtRef.current = timestamp;
        setMainPanelPanSyncIntent(intent);
      }
    };

    controls.addEventListener("change", handleControlsChange);

    return () => {
      controls.removeEventListener("change", handleControlsChange);
    };
  }, [cameraControlsRef, setMainPanelPanSyncIntent]);

  return null;
};

const AnnotationControls = () => {
  return (
    <>
      <AnnotationPlane panelType="main" viewType="top" />
      <SegmentPolylineRenderer />
      <CreateCuboidRenderer />
      <Crosshair3D panelId={PANEL_ID_MAIN} />
    </>
  );
};
