import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useBrowserStorage } from "@fiftyone/state";
import { MenuItem, Select } from "@mui/material";
import {
  Bvh,
  CameraControls,
  MapControls,
  OrthographicCamera,
  View,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import * as THREE from "three";
import { Box3, Vector3 } from "three";
import { AnnotationPlane } from "../components/AnnotationPlane";
import { Crosshair3D } from "../components/Crosshair3D";
import { PcdColorMapTunnel } from "../components/PcdColormapModal";
import { StatusBarRootContainer } from "../containers";
import { FoScene } from "../hooks";
import { ThreeDLabels } from "../labels";
import { SpinningCube } from "../SpinningCube";
import {
  activeNodeAtom,
  currentHoveredPointAtom,
  isPointTransformModeAtom,
  isPointTransformingAtom,
  isTransformingAtom,
  selectedPointAtom,
} from "../state";
import { StatusBar } from "../StatusBar";
import { useFo3dContext } from "./context";
import { Fo3dSceneContent } from "./Fo3dCanvas";
import { FoSceneComponent } from "./FoScene";
import { Gizmos } from "./Gizmos";
import HoverMetadataHUD from "./HoverMetadataHUD";
import { TransformHUD } from "./TransformHUD";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

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
        // If up is mostly Y, use X axis
        direction = new Vector3(-1, 0, 0);
      } else {
        // Create perpendicular vector
        direction = new Vector3(0, 1, 0).cross(upDir).normalize();
      }
      break;
    case "Right":
      // Opposite of Left
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(1, 0, 0);
      } else {
        direction = new Vector3(0, 1, 0).cross(upDir).normalize().negate();
      }
      break;
    case "Front":
      // Create a vector perpendicular to both up and left
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(0, 0, 1);
      } else {
        const left = new Vector3(0, 1, 0).cross(upDir).normalize();
        direction = upDir.clone().cross(left).normalize();
      }
      break;
    case "Back":
      // Opposite of Front
      if (Math.abs(upDir.y) > 0.9) {
        direction = new Vector3(0, 0, -1);
      } else {
        const left = new Vector3(0, 1, 0).cross(upDir).normalize();
        direction = upDir.clone().cross(left).normalize().negate();
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
  middle: ViewType;
  bottom: ViewType;
}

const defaultState: MultiPanelViewState = {
  top: "Top",
  middle: "Front",
  bottom: "Right",
};

interface MultiPanelViewProps {
  cameraControlsRef: React.MutableRefObject<CameraControlsImpl>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera>;
  defaultCameraPosition: Vector3;
  foScene: FoScene;
  sample: any;
}

export const MultiPanelView = ({
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
  const isTransforming = useRecoilValue(isTransformingAtom);
  const isPointTransforming = useRecoilValue(isPointTransformingAtom);

  const keyState = useRef({
    shiftRight: false,
    shiftLeft: false,
    controlRight: false,
    controlLeft: false,
  });

  const assetsGroupRef = useRef<THREE.Group>();

  const updateCameraControlsConfig = useCallback(() => {
    if (!cameraControlsRef.current) return;

    if (isTransforming || isPointTransforming) {
      cameraControlsRef.current.enabled = false;
      return;
    }

    cameraControlsRef.current.enabled = true;

    if (keyState.current.shiftRight || keyState.current.shiftLeft) {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.TRUCK;
    } else if (keyState.current.controlRight || keyState.current.controlLeft) {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.DOLLY;
    } else {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.ROTATE;
    }
  }, [isTransforming, isPointTransforming]);

  fos.useEventHandler(document, "keydown", (e: KeyboardEvent) => {
    if (e.code === "ShiftRight") keyState.current.shiftRight = true;
    if (e.code === "ShiftLeft") keyState.current.shiftLeft = true;
    if (e.code === "ControlRight") keyState.current.controlRight = true;
    if (e.code === "ControlLeft") keyState.current.controlLeft = true;
    updateCameraControlsConfig();
  });

  fos.useEventHandler(document, "keyup", (e: KeyboardEvent) => {
    if (e.code === "ShiftRight") keyState.current.shiftRight = false;
    if (e.code === "ShiftLeft") keyState.current.shiftLeft = false;
    if (e.code === "ControlRight") keyState.current.controlRight = false;
    if (e.code === "ControlLeft") keyState.current.controlLeft = false;
    updateCameraControlsConfig();
  });

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      (event: MouseEvent | null) => {
        if (event?.type === "contextmenu") return;
        set(activeNodeAtom, null);
        set(currentHoveredPointAtom, null);
        set(selectedPointAtom, null);
        set(isPointTransformModeAtom, false);
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

  const [pointCloudSettings] = useBrowserStorage("fo3dPointCloudSettings", {
    enableTooltip: false,
    rayCastingSensitivity: "medium",
  });

  const setPanelView = useCallback(
    (
      which: keyof Pick<MultiPanelViewState, "top" | "middle" | "bottom">,
      view: ViewType
    ) => {
      setPanelState((prev) => ({ ...prev, [which]: view }));
    },
    [setPanelState]
  );

  return (
    <main
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateAreas: `
            "main top"
            "main middle"
            "main bottom"
          `,
        gridTemplateColumns: "2fr 1fr",
        gridTemplateRows: "1fr 1fr 1fr",
        height: "100%",
        width: "100%",
        gap: "4px",
      }}
    >
      <HoverMetadataHUD />
      <TransformHUD />
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
        pointCloudSettings={pointCloudSettings}
      />

      <SidePanel
        which="middle"
        view={panelState.middle}
        setView={(view) => setPanelView("middle", view)}
        foScene={foScene}
        upVector={upVector}
        lookAt={lookAt}
        sceneBoundingBox={sceneBoundingBox}
        isSceneInitialized={isSceneInitialized}
        sample={sample}
        pointCloudSettings={pointCloudSettings}
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
        pointCloudSettings={pointCloudSettings}
      />

      <StatusBarRootContainer>
        <StatusBar cameraRef={cameraRef} />
      </StatusBarRootContainer>
    </main>
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
    <div
      id="main-panel"
      style={{ gridArea: "main", position: "relative", zIndex: 2 }}
    >
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
    </div>
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
  pointCloudSettings,
}: {
  which: "top" | "middle" | "bottom";
  view: ViewType;
  setView: (view: ViewType) => void;
  foScene: any;
  upVector: Vector3 | null;
  lookAt: Vector3 | null;
  sceneBoundingBox: Box3 | null;
  isSceneInitialized: boolean;
  sample: any;
  pointCloudSettings: any;
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

  const zoom = view === "Front" || view === "Back" ? 10 : 10;

  return (
    <div
      id={`${which}-panel`}
      style={{ gridArea: which, position: "relative", zIndex: 200 }}
    >
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
          zoom={zoom}
          near={0}
          far={foScene?.cameraProps.far ?? 2500}
          onUpdate={(cam) => cam.updateProjectionMatrix()}
        />

        <MapControls makeDefault screenSpacePanning enableRotate={false} />

        <Gizmos isGridVisible={false} isGizmoHelperVisible={false} />
        {!isSceneInitialized && <SpinningCube />}
        <Bvh firstHitOnly enabled={pointCloudSettings.enableTooltip}>
          <group visible={isSceneInitialized}>
            <FoSceneComponent scene={foScene} />
          </group>
        </Bvh>
        {isSceneInitialized && (
          <ThreeDLabels sampleMap={{ fo3d: sample as any }} />
        )}
        <AnnotationPlane showTransformControls={false} />
        <Crosshair3D />
      </View>
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          zIndex: 1000,
        }}
      >
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
          <MenuItem value="Top">Top</MenuItem>
          <MenuItem value="Bottom">Bottom</MenuItem>
          <MenuItem value="Left">Left</MenuItem>
          <MenuItem value="Right">Right</MenuItem>
          <MenuItem value="Front">Front</MenuItem>
          <MenuItem value="Back">Back</MenuItem>
        </Select>
      </div>
    </div>
  );
};
