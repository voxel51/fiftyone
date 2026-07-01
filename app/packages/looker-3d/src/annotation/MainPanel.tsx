import { View } from "@react-three/drei";
import styled from "styled-components";
import * as THREE from "three";
import { Vector3 } from "three";
import { PANEL_ID_MAIN, getPanelElementId } from "../constants";
import type { Fo3dCameraControls } from "../fo3d/camera-controls";
import { Fo3dSceneContent } from "../fo3d/Fo3dCanvas";
import type { FoScene } from "../fo3d/render-types";
import { AnnotationMultiViewGizmoOverlayWrapper } from "./CustomAnnotationGizmo";

const MainPanelContainer = styled.div`
  grid-area: main;
  position: relative;
  z-index: 2;
`;

export interface MainPanelProps {
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
  defaultCameraPosition: THREE.Vector3;
  autoRotate: boolean;
  foScene: FoScene;
  upVector: Vector3 | null;
  isSceneInitialized: boolean;
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
  assetsGroupRef,
}: MainPanelProps) => {
  return (
    <MainPanelContainer id={getPanelElementId(PANEL_ID_MAIN)}>
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
          autoRotate={autoRotate}
          cameraControlsRef={cameraControlsRef}
          cameraPosition={defaultCameraPosition}
          foScene={foScene}
          isSceneInitialized={isSceneInitialized}
          isGizmoHelperVisible={false}
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
