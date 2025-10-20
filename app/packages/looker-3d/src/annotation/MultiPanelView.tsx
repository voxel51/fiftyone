import { useTheme } from "@fiftyone/components";
import { useBrowserStorage } from "@fiftyone/state";
import { MenuItem, Select } from "@mui/material";
import {
  Bounds,
  CameraControls,
  MapControls,
  OrthographicCamera,
  View,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilCallback } from "recoil";
import styled from "styled-components";
import * as THREE from "three";
import { Box3, Vector3 } from "three";
import { PcdColorMapTunnel } from "../components/PcdColormapModal";
import { StatusBarRootContainer } from "../containers";
import { useFo3dContext } from "../fo3d/context";
import { Fo3dSceneContent } from "../fo3d/Fo3dCanvas";
import { FoSceneComponent } from "../fo3d/FoScene";
import { Gizmos } from "../fo3d/Gizmos";
import HoverMetadataHUD from "../fo3d/HoverMetadataHUD";
import { Lights } from "../fo3d/scene-controls/lights/Lights";
import { FoScene } from "../hooks";
import { ThreeDLabels } from "../labels";
import {
  activeNodeAtom,
  currentArchetypeSelectedForTransformAtom,
  currentHoveredPointAtom,
  selectedPolylineVertexAtom,
} from "../state";
import { StatusBar } from "../StatusBar";
import { AnnotationPlane } from "./AnnotationPlane";
import { Crosshair3D } from "./Crosshair3D";
import { SegmentPolylineRenderer } from "./SegmentPolylineRenderer";

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

const AbsoluteFill = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const MainPanelContainer = styled.div`
  grid-area: main;
  position: relative;
  z-index: 2;
`;

const SidePanelContainer = styled.div<{ $area: string }>`
  grid-area: ${(p) => p.$area};
  position: relative;
  z-index: 200;
`;

const ViewSelectorWrapper = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1000;
`;

/**
 * Calculate camera position for different side panel views based on upVector and lookAt point
 */
const calculateCameraPositionForSidePanel = (
  viewType: ViewType,
  upVector: Vector3,
  lookAt: Vector3,
  sceneBoundingBox: Box3 | null
): Vector3 => {
  if (!sceneBoundingBox) {
    // Fallback to default positions if no bounding box
    const defaultPositions = {
      Top: [0, 10, 0] as [number, number, number],
      Bottom: [0, -10, 0] as [number, number, number],
      Left: [-10, 0, 0] as [number, number, number],
      Right: [10, 0, 0] as [number, number, number],
      Back: [0, 0, -10] as [number, number, number],
      Front: [0, 0, 10] as [number, number, number],
    };
    return new Vector3(...defaultPositions[viewType]);
  }

  const size = new Vector3();
  sceneBoundingBox.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize * 2.5;

  const upDir = upVector.clone().normalize();
  const center = lookAt.clone();

  // Create orthogonal vectors for different views
  let direction: Vector3;

  switch (viewType) {
    case "Top":
      direction = upDir.clone();
      break;
    case "Bottom":
      direction = upDir.clone().negate();
      break;
    case "Left":
      // Create a vector perpendicular to up vector
      if (Math.abs(upDir.y) > 0.9) {
        // If up is mostly Y, use negative X axis for left
        direction = new Vector3(-1, 0, 0);
      } else {
        const right = new Vector3(0, 1, 0).cross(upDir).normalize();
        direction = right.negate();
      }
      break;
    case "Right":
      // Opposite of Left
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(1, 0, 0);
      } else {
        direction = new Vector3(0, 1, 0).cross(upDir).normalize();
      }
      break;
    case "Front":
      // Create a vector perpendicular to both up and left
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(0, 0, 1);
      } else {
        const left = new Vector3(0, -1, 0).cross(upDir).normalize();
        direction = upDir.clone().cross(left).normalize();
      }
      break;
    case "Back":
      // Opposite of Front
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(0, 0, -1);
      } else {
        const left = new Vector3(0, 1, 0).cross(upDir).normalize();
        direction = upDir.clone().cross(left).normalize();
      }
      break;
    default:
      direction = upDir.clone();
  }

  return center.clone().add(direction.multiplyScalar(distance));
};

type ViewType = "Top" | "Bottom" | "Left" | "Right" | "Front" | "Back";

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
  sample: any;
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
    rayCastingSensitivity: "high",
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
        which="top"
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
        which="bottom"
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

const MainPanel = ({
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
}: {
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
}) => {
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
    </MainPanelContainer>
  );
};

const SidePanel = ({
  which,
  view,
  setView,
  foScene,
  upVector,
  lookAt,
  sceneBoundingBox,
  isSceneInitialized,
  sample,
}: {
  which: "top" | "middle" | "bottom";
  view: ViewType;
  setView: (view: ViewType) => void;
  foScene: FoScene;
  upVector: Vector3 | null;
  lookAt: Vector3 | null;
  sceneBoundingBox: Box3 | null;
  isSceneInitialized: boolean;
  sample: any;
}) => {
  const position = useMemo(
    () =>
      upVector && lookAt
        ? calculateCameraPositionForSidePanel(
            view,
            upVector,
            lookAt,
            sceneBoundingBox
          )
        : new Vector3(0, 10, 0),
    [view, upVector, lookAt, sceneBoundingBox]
  );

  const theme = useTheme();

  const cameraRef = useRef<THREE.OrthographicCamera>();

  // We need to observe the bounds for a short period of time to ensure the camera is in the correct position
  // But turn it off so that users can pan/zoom and work with a stable scene
  const [observe, setObserve] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setObserve(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SidePanelContainer id={`${which}-panel`} $area={which}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <OrthographicCamera
          makeDefault
          ref={cameraRef}
          position={position}
          up={upVector ?? [0, 1, 0]}
        />
        <MapControls makeDefault screenSpacePanning enableRotate={false} />
        <Bounds fit clip observe={observe} margin={1.25}>
          <Gizmos isGridVisible={false} isGizmoHelperVisible={false} />
          <group visible={isSceneInitialized}>
            <FoSceneComponent scene={foScene} />
          </group>
          {isSceneInitialized && (
            <ThreeDLabels
              sampleMap={{ fo3d: sample as any }}
              globalOpacity={0.15}
            />
          )}
          <AnnotationPlane
            showTransformControls={false}
            panelType="side"
            viewType={
              view.toLowerCase() as
                | "top"
                | "bottom"
                | "right"
                | "left"
                | "front"
                | "back"
            }
          />
          <SegmentPolylineRenderer ignoreEffects />
          <Crosshair3D />
        </Bounds>
        <Lights lights={foScene?.lights} />
      </View>
      <ViewSelectorWrapper>
        <Select
          value={view}
          onChange={(e) => setView(e.target.value as ViewType)}
          size="small"
          sx={{
            backgroundColor: (theme as any).background.level3,
            "& .MuiSelect-select": {
              padding: "6px 10px",
              fontSize: "12px",
            },
          }}
          MenuProps={{
            sx: {
              zIndex: 1002,
            },
          }}
        >
          <MenuItem value="Left">Left</MenuItem>
          <MenuItem value="Right">Right</MenuItem>
          <MenuItem value="Front">Front</MenuItem>
          <MenuItem value="Back">Back</MenuItem>
        </Select>
      </ViewSelectorWrapper>
    </SidePanelContainer>
  );
};
