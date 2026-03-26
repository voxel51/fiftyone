import type { CameraControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import type * as THREE from "three";
import type { Vector3 } from "three";
import { StatusBar } from "../StatusBar";
import { PcdColorMapTunnel } from "../components/PcdColormapModal";
import { StatusBarRootContainer } from "../containers";
import { Fo3dSceneContent } from "../fo3d/Fo3dCanvas";
import HoverMetadataHUD from "../fo3d/HoverMetadataHUD";
import { useFo3dContext } from "../fo3d/context";
import type { FoScene } from "../fo3d/render-types";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

const MainContainer = styled.main`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

interface SinglePanelViewProps {
  assetsGroupRef: React.RefObject<THREE.Group>;
  cameraControlsRef: React.RefObject<CameraControls>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  defaultCameraPosition: Vector3;
  foScene: FoScene;
  onPointerMissed: (event: MouseEvent | null) => void;
}

export const SinglePanelView = ({
  assetsGroupRef,
  cameraControlsRef,
  cameraRef,
  defaultCameraPosition,
  foScene,
  onPointerMissed,
}: SinglePanelViewProps) => {
  const { upVector, autoRotate, isSceneInitialized, pointCloudSettings } =
    useFo3dContext();

  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    containerRef.current
      ?.querySelector(`#${CANVAS_WRAPPER_ID} canvas`)
      ?.setAttribute("canvas-loaded", "true");
  }, [isSceneInitialized]);

  return (
    <MainContainer ref={containerRef}>
      <HoverMetadataHUD />
      <PcdColorMapTunnel.Out />
      <Canvas
        id={CANVAS_WRAPPER_ID}
        eventSource={containerRef}
        onPointerMissed={onPointerMissed}
        key={upVector ? upVector.toArray().join(",") : null}
      >
        <Fo3dSceneContent
          cameraPosition={defaultCameraPosition}
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
          pointCloudSettings={pointCloudSettings}
          assetsGroupRef={assetsGroupRef}
          cameraRef={cameraRef}
        />
      </Canvas>
      <StatusBarRootContainer>
        <StatusBar cameraRef={cameraRef} />
      </StatusBarRootContainer>
    </MainContainer>
  );
};
