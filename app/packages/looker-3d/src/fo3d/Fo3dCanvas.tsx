import * as fos from "@fiftyone/state";
import {
  AdaptiveDpr,
  AdaptiveEvents,
  OrbitControls,
  PerspectiveCamera as PerspectiveCameraDrei,
} from "@react-three/drei";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
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
import {
  activeCursorPanelAtom,
  mainPanelPanSyncIntentAtom,
  mainPanelZoomSyncIntentAtom,
  raycastResultAtom,
} from "../state";
import type { Fo3dCameraControls } from "./camera-controls";
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
      <MainPanelNavigationSyncEmitter cameraControlsRef={cameraControlsRef} />
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
        panSpeed={1.15}
        zoomToCursor
      />

      <SceneControls scene={foScene} cameraControlsRef={cameraControlsRef} />

      <Gizmos
        isGizmoHelperVisible={isGizmoHelperVisible}
        isGridVisible={true}
      />
      {!isSceneInitialized && <SpinningCube />}

      <group ref={assetsGroupRef} visible={isSceneInitialized}>
        <FoSceneComponent scene={foScene} />
      </group>

      {isSceneInitialized && (
        <>
          <ThreeDLabels sampleMap={labelSampleMap} />
          <FrustumCollection />
        </>
      )}

      {mode === "annotate" && <AnnotationControls />}
    </>
  );
};

const MainPanelNavigationSyncEmitter = ({
  cameraControlsRef,
}: {
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
}) => {
  const activeCursorPanel = useRecoilValue(activeCursorPanelAtom);
  const raycastResult = useRecoilValue(raycastResultAtom);
  const setMainPanelPanSyncIntent = useSetRecoilState(
    mainPanelPanSyncIntentAtom
  );
  const setMainPanelZoomSyncIntent = useSetRecoilState(
    mainPanelZoomSyncIntentAtom
  );
  const activeCursorPanelRef = useRef(activeCursorPanel);
  const isMainPanelPointerDragRef = useRef(false);
  const lastControlsTargetRef = useRef<THREE.Vector3 | null>(null);
  const lastPanIntentAtRef = useRef(0);
  const raycastResultRef = useRef(raycastResult);
  const sequenceRef = useRef(0);

  useEffect(() => {
    activeCursorPanelRef.current = activeCursorPanel;
  }, [activeCursorPanel]);

  useEffect(() => {
    raycastResultRef.current = raycastResult;
  }, [raycastResult]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const timestamp = Date.now();
      const intent = createMainPanelZoomSyncIntent({
        activeCursorPanel: activeCursorPanelRef.current,
        deltaY: event.deltaY,
        id: `${timestamp}-${sequenceRef.current++}`,
        raycastResult: raycastResultRef.current,
        timestamp,
      });

      if (intent) {
        setMainPanelZoomSyncIntent(intent);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [setMainPanelZoomSyncIntent]);

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
