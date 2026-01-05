import * as fos from "@fiftyone/state";
import {
  AdaptiveDpr,
  AdaptiveEvents,
  Bvh,
  CameraControls,
  OrbitControls,
  PerspectiveCamera as PerspectiveCameraDrei,
} from "@react-three/drei";
import { useAtomValue } from "jotai";
import * as THREE from "three";
import { Vector3 } from "three";
import { SpinningCube } from "../SpinningCube";
import { StatusTunnel } from "../StatusBar";
import { AnnotationPlane } from "../annotation/AnnotationPlane";
import { SegmentPolylineRenderer } from "../annotation/SegmentPolylineRenderer";
import { FoScene } from "../hooks";
import { useCameraViews } from "../hooks/use-camera-views";
import { ThreeDLabels } from "../labels";
import { FoSceneComponent } from "./FoScene";
import { Gizmos } from "./Gizmos";
import { Fo3dPointCloudSettings } from "./context";
import { SceneControls } from "./scene-controls/SceneControls";

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
      <Bvh firstHitOnly enabled={pointCloudSettings.enableTooltip}>
        <group ref={assetsGroupRef} visible={isSceneInitialized}>
          <FoSceneComponent scene={foScene} />
        </group>
      </Bvh>

      {isSceneInitialized && (
        <ThreeDLabels sampleMap={{ fo3d: sample as any }} />
      )}

      {mode === "annotate" && <AnnotationControls />}
    </>
  );
};

const AnnotationControls = () => {
  return (
    <>
      <AnnotationPlane panelType="main" viewType="top" />
      <SegmentPolylineRenderer />
    </>
  );
};
