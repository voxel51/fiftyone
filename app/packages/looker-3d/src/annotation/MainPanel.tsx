import { CameraControls, View } from "@react-three/drei";
import styled from "styled-components";
import * as THREE from "three";
import { Vector3 } from "three";
import { Fo3dSceneContent } from "../fo3d/Fo3dCanvas";
import { AnnotationMultiViewGizmoOverlayWrapper } from "./CustomAnnotationGizmo";

const MainPanelContainer = styled.div`
  grid-area: main;
  position: relative;
  z-index: 2;
`;

export interface MainPanelProps {
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  cameraControlsRef: React.RefObject<CameraControls>;
  defaultCameraPosition: THREE.Vector3;
  autoRotate: boolean;
  foScene: any;
  upVector: Vector3 | null;
  isSceneInitialized: boolean;
  sample: any;
  pointCloudSettings: any;
  assetsGroupRef: React.RefObject<THREE.Group>;
}

export const MainPanel = ({
  cameraRef,
  cameraControlsRef,
  defaultCameraPosition,
  autoRotate,
  foScene,
  upVector,
  isSceneInitialized,
  sample,
  pointCloudSettings,
  assetsGroupRef,
}: MainPanelProps) => {
  return (
    <MainPanelContainer id="main-panel">
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <Fo3dSceneContent
          upVector={upVector}
          fov={foScene?.cameraProps.fov ?? 50}
          near={foScene?.cameraProps.near ?? 0.1}
          far={foScene?.cameraProps.far ?? 2500}
          aspect={foScene?.cameraProps.aspect ?? 1}
          zoom={10}
          autoRotate={autoRotate}
          cameraControlsRef={cameraControlsRef}
          cameraPosition={defaultCameraPosition}
          foScene={foScene}
          isSceneInitialized={isSceneInitialized}
          isGizmoHelperVisible={false}
          sample={sample}
          pointCloudSettings={pointCloudSettings}
          assetsGroupRef={assetsGroupRef}
          cameraRef={cameraRef}
        />
      </View>
      <AnnotationMultiViewGizmoOverlayWrapper
        mainCamera={cameraRef}
        cameraControlsRef={cameraControlsRef}
      />
    </MainPanelContainer>
  );
};
