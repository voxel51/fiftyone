import { ModalSample, useBrowserStorage } from "@fiftyone/state";
import { View } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useRecoilCallback } from "recoil";
import styled from "styled-components";
import * as THREE from "three";
import { Vector3 } from "three";
import { PcdColorMapTunnel } from "../components/PcdColormapModal";
import { PANEL_ID_SIDE_BOTTOM, PANEL_ID_SIDE_TOP } from "../constants";
import { StatusBarRootContainer } from "../containers";
import { useFo3dContext } from "../fo3d/context";
import HoverMetadataHUD from "../fo3d/HoverMetadataHUD";
import { FoScene } from "../hooks";
import {
  activeNodeAtom,
  currentArchetypeSelectedForTransformAtom,
  currentHoveredPointAtom,
  selectedPolylineVertexAtom,
} from "../state";
import { StatusBar } from "../StatusBar";
import { GlobalCursorCoordinator } from "./GlobalCursorCoordinator";
import { MainPanel } from "./MainPanel";
import { SidePanel, ViewType } from "./SidePanel";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

const GridMain = styled.main`
  display: grid;
  grid-template-areas: "main top" "main bottom";
  grid-template-columns: 2fr 1.1fr;
  grid-template-rows: 1fr 1fr;
  height: 100%;
  width: 100%;
  gap: 1px;
`;

interface MultiPanelViewState {
  top: ViewType;
  bottom: ViewType;
}

const defaultState: MultiPanelViewState = {
  top: "Front",
  bottom: "Right",
};

interface MultiPanelViewProps {
  assetsGroupRef: React.RefObject<THREE.Group>;
  cameraControlsRef: React.MutableRefObject<CameraControlsImpl>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera>;
  defaultCameraPosition: Vector3;
  foScene: FoScene;
  sample: ModalSample;
}

export const MultiPanelView = ({
  assetsGroupRef,
  cameraControlsRef,
  cameraRef,
  defaultCameraPosition,
  foScene,
  sample,
}: MultiPanelViewProps) => {
  const { isSceneInitialized, upVector, lookAt, sceneBoundingBox } =
    useFo3dContext();
  const [panelState, setPanelState] = useBrowserStorage<MultiPanelViewState>(
    "fo3d-multi-panel-state",
    defaultState
  );

  const containerRef = useRef<HTMLDivElement>(null);

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      (event: MouseEvent | null) => {
        if (event?.type === "contextmenu") return;
        set(activeNodeAtom, null);
        set(currentHoveredPointAtom, null);
        set(selectedPolylineVertexAtom, null);
        set(currentArchetypeSelectedForTransformAtom, null);
      },
    []
  );

  useLayoutEffect(() => {
    const canvas = document.getElementById(CANVAS_WRAPPER_ID);
    if (canvas) {
      canvas.querySelector("canvas")?.setAttribute("canvas-loaded", "true");
    }
  }, [isSceneInitialized]);

  const [autoRotate] = useBrowserStorage("fo3dAutoRotate", false);

  const [pointCloudSettings] = useBrowserStorage("fo3d-pointCloudSettings", {
    enableTooltip: false,
  });

  const setPanelView = useCallback(
    (
      which: keyof Pick<MultiPanelViewState, "top" | "bottom">,
      view: ViewType
    ) => {
      setPanelState((prev) => ({ ...prev, [which]: view }));
    },
    [setPanelState]
  );

  return (
    <GridMain ref={containerRef}>
      <GlobalCursorCoordinator containerRef={containerRef} />
      <HoverMetadataHUD />
      <PcdColorMapTunnel.Out />

      <Canvas
        id={CANVAS_WRAPPER_ID}
        eventSource={containerRef}
        onPointerMissed={resetActiveNode}
        key={upVector ? upVector.toArray().join(",") : null}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      >
        <View.Port />
      </Canvas>

      <MainPanel
        cameraRef={cameraRef}
        cameraControlsRef={cameraControlsRef}
        defaultCameraPosition={defaultCameraPosition}
        autoRotate={autoRotate}
        foScene={foScene}
        upVector={upVector}
        isSceneInitialized={isSceneInitialized}
        sample={sample}
        pointCloudSettings={pointCloudSettings}
        assetsGroupRef={assetsGroupRef}
      />

      <SidePanel
        panelId={PANEL_ID_SIDE_TOP}
        view={panelState.top}
        setView={(view) => setPanelView("top", view)}
        foScene={foScene}
        upVector={upVector}
        lookAt={lookAt}
        sceneBoundingBox={sceneBoundingBox}
        isSceneInitialized={isSceneInitialized}
        sample={sample}
      />

      <SidePanel
        panelId={PANEL_ID_SIDE_BOTTOM}
        view={panelState.bottom}
        setView={(view) => setPanelView("bottom", view)}
        foScene={foScene}
        upVector={upVector}
        lookAt={lookAt}
        sceneBoundingBox={sceneBoundingBox}
        isSceneInitialized={isSceneInitialized}
        sample={sample}
      />

      <StatusBarRootContainer>
        <StatusBar cameraRef={cameraRef} />
      </StatusBarRootContainer>
    </GridMain>
  );
};
