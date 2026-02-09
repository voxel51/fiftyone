import * as fos from "@fiftyone/state";
import {
  AdaptiveDpr,
  AdaptiveEvents,
  CameraControls,
  OrbitControls,
  PerspectiveCamera as PerspectiveCameraDrei,
} from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import * as THREE from "three";
import { Vector3 } from "three";
import { SpinningCube } from "../SpinningCube";
import { StatusTunnel } from "../StatusBar";
import { AnnotationPlane } from "../annotation/AnnotationPlane";
import { CreateCuboidRenderer } from "../annotation/CreateCuboidRenderer";
import { Crosshair3D } from "../annotation/Crosshair3D";
import { SegmentPolylineRenderer } from "../annotation/SegmentPolylineRenderer";
import { PANEL_ID_MAIN } from "../constants";
import { FrustumCollection } from "../frustum";
import { FoScene } from "../hooks";
import { useCameraViews } from "../hooks/use-camera-views";
import { ThreeDLabels } from "../labels";
import { RaycastService } from "../services/RaycastService";
import { precisionToThreshold } from "../utils";
import { FoSceneComponent } from "./FoScene";
import { Gizmos } from "./Gizmos";
import { Fo3dPointCloudSettings, useFo3dContext } from "./context";
import { SceneControls } from "./scene-controls/SceneControls";

/**
 * Sets the raycaster threshold for Points based on raycast precision setting.
 * This affects all raycasting in the scene.
 */
const RaycasterConfig = () => {
  const { raycaster } = useThree();
  const { raycastPrecision } = useFo3dContext();

  useEffect(() => {
    const threshold = precisionToThreshold(raycastPrecision);
    if (raycaster.params.Points) {
      raycaster.params.Points.threshold = threshold;
    }
  }, [raycaster, raycastPrecision]);

  return null;
};

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
   * Camera zoom (for orthographic)
   */
  zoom?: number;
  /**
   * Whether auto-rotate is enabled
   */
  autoRotate: boolean;
  /**
   * Reference to camera controls
   */
  cameraControlsRef: React.RefObject<CameraControls>;
  /**
   * The 3D scene to render
   */
  foScene: FoScene;
  /**
   * Whether the scene is initialized
   */
  isSceneInitialized: boolean;
  /**
   * Sample data for labels
   */
  sample: fos.ModalSample;
  /**
   * Point cloud settings
   */
  pointCloudSettings: Fo3dPointCloudSettings;
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
  zoom = 100,
  autoRotate,
  cameraControlsRef,
  foScene,
  isSceneInitialized,
  isGizmoHelperVisible,
  sample,
  pointCloudSettings,
  assetsGroupRef,
  cameraRef,
}: Fo3dSceneContentProps) => {
  const mode = useAtomValue(fos.modalMode);

  useCameraViews({
    cameraRef,
    cameraControlsRef,
  });

  return (
    <>
      <RaycasterConfig />
      <StatusTunnel.Out />
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

      {!autoRotate ? (
        <CameraControls
          smoothTime={0.1}
          dollySpeed={0.1}
          dollyToCursor
          ref={cameraControlsRef}
        />
      ) : (
        <OrbitControls autoRotate={autoRotate} makeDefault />
      )}

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
          <ThreeDLabels sampleMap={{ fo3d: sample }} />
          <FrustumCollection />
        </>
      )}

      {mode === "annotate" && <AnnotationControls />}
    </>
  );
};

const AnnotationControls = () => {
  return (
    <>
      <AnnotationPlane panelType="main" viewType="top" />
      <RaycastService panelId={PANEL_ID_MAIN} />
      <SegmentPolylineRenderer />
      <CreateCuboidRenderer />
      <Crosshair3D panelId={PANEL_ID_MAIN} />
    </>
  );
};
