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
import { useCallback, useLayoutEffect, useRef } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import * as THREE from "three";
import { Vector3 } from "three";
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

// Camera positions for different views
const cameraPositions = {
  Top: [0, 10, 0] as [number, number, number],
  Bottom: [0, -10, 0] as [number, number, number],
  Left: [-10, 0, 0] as [number, number, number],
  Right: [10, 0, 0] as [number, number, number],
  Back: [0, 0, -10] as [number, number, number],
  Front: [0, 0, 10] as [number, number, number],
};

type ViewType = "Top" | "Bottom" | "Left" | "Right" | "Front" | "Back";
type ProjectionType = "Perspective" | "Orthographic";

interface MultiPanelViewState {
  projection: ProjectionType;
  top: ViewType;
  middle: ViewType;
  bottom: ViewType;
}

const defaultState: MultiPanelViewState = {
  projection: "Perspective",
  top: "Back",
  middle: "Top",
  bottom: "Right",
};

interface MultiPanelViewProps {
  cameraControlsRef: React.MutableRefObject<CameraControlsImpl>;
  cameraRef: React.MutableRefObject<
    THREE.PerspectiveCamera | THREE.OrthographicCamera
  >;
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
  const { isSceneInitialized, upVector } = useFo3dContext();
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

  const setProjection = useCallback(
    (projection: ProjectionType) => {
      setPanelState((prev) => ({ ...prev, projection }));
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
        projection={panelState.projection}
        setProjection={setProjection}
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
  projection,
  setProjection,
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
  projection: ProjectionType;
  setProjection: (projection: ProjectionType) => void;
  cameraRef: React.RefObject<
    THREE.PerspectiveCamera | THREE.OrthographicCamera
  >;
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
  const theme = useTheme();
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
          projection={projection}
          cameraRef={cameraRef}
        />
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
          value={projection}
          onChange={(e) => setProjection(e.target.value as ProjectionType)}
          size="small"
          sx={{
            backgroundColor: (theme as any).background.level3,
            "& .MuiSelect-select": {
              padding: "8px 12px",
              fontSize: "14px",
            },
          }}
          MenuProps={{
            sx: {
              zIndex: 1002,
            },
          }}
        >
          <MenuItem value="Perspective">Perspective</MenuItem>
          <MenuItem value="Orthographic">Orthographic</MenuItem>
        </Select>
      </div>
    </div>
  );
};

const SidePanel = ({
  which,
  view,
  setView,
  foScene,
  upVector,
  isSceneInitialized,
  sample,
  pointCloudSettings,
}: {
  which: "top" | "middle" | "bottom";
  view: ViewType;
  setView: (view: ViewType) => void;
  foScene: any;
  upVector: Vector3 | null;
  isSceneInitialized: boolean;
  sample: any;
  pointCloudSettings: any;
}) => {
  const position = cameraPositions[view];
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
          near={foScene?.cameraProps.near ?? 0.1}
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
