import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { AdaptiveDpr, AdaptiveEvents, OrbitControls } from "@react-three/drei";
import { Canvas, RootState } from "@react-three/fiber";
import { Leva } from "leva";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  Looker3dPluginSettings,
  defaultPluginSettings,
} from "../Looker3dPlugin";
import { SpinningCube } from "../SpinningCube";
import { StatusBar, StatusTunnel } from "../StatusBar";
import {
  ACTION_GRID,
  ACTION_SET_EGO_VIEW,
  ACTION_SET_TOP_VIEW,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
  DEFAULT_CAMERA_POSITION,
  VOXEL51_COMPLEMENTARY_COLOR,
  VOXEL51_THEME_COLOR,
  VOXEL51_THEME_COLOR_MUTED,
} from "../constants";
import { LevaContainer, StatusBarRootContainer } from "../containers";
import { useFo3d, useHotkey } from "../hooks";
import { useFo3dBounds } from "../hooks/use-bounds";
import { ThreeDLabels } from "../labels";
import {
  actionRenderListAtomFamily,
  activeNodeAtom,
  isFo3dBackgroundOnAtom,
} from "../state";
import { FoSceneComponent } from "./FoScene";
import { Gizmos } from "./Gizmos";
import { Fo3dSceneContext } from "./context";
import { Lights } from "./lights/Lights";
import { getMediaUrlForFo3dSample } from "./utils";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

type MediaTypeFo3dComponentProps = {};

export const MediaTypeFo3dComponent = ({}: MediaTypeFo3dComponentProps) => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  const settings = usePluginSettings<Looker3dPluginSettings>(
    "3d",
    defaultPluginSettings
  );

  const mediaUrl = useMemo(
    () => getMediaUrlForFo3dSample(sample, mediaField),
    [mediaField, sample]
  );

  const { foScene, isLoading: isParsingFo3d } = useFo3d(mediaUrl);

  const [isSceneInitialized, setSceneInitialized] = useState(false);

  useHotkey(
    "KeyB",
    ({ set }) => {
      set(isFo3dBackgroundOnAtom, (prev) => !prev);
    },
    []
  );

  const upVector = useMemo(() => {
    if (foScene?.cameraProps.up) {
      const mayBeUp = foScene.cameraProps.up;
      if (mayBeUp === "X") {
        return new Vector3(1, 0, 0);
      }
      if (mayBeUp === "Y") {
        return new Vector3(0, 1, 0);
      }
      if (mayBeUp === "Z") {
        return new Vector3(0, 0, 1);
      }
    }

    // default to y-up
    return new Vector3(0, 1, 0);
  }, [foScene]);

  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const orbitControlsRef = useRef<OrbitControlsImpl>();

  const assetsGroupRef = useRef<THREE.Group>();
  const sceneBoundingBox = useFo3dBounds(assetsGroupRef);

  const topCameraPosition = useMemo(() => {
    if (!sceneBoundingBox || Math.abs(sceneBoundingBox.max.x) === Infinity) {
      return DEFAULT_CAMERA_POSITION();
    }

    const center = sceneBoundingBox.getCenter(new Vector3());
    const size = sceneBoundingBox.getSize(new Vector3());
    if (upVector.y === 1) {
      return new Vector3(
        center.x,
        center.y + Math.max(size.y, size.x, size.z) * 2.5,
        0
      );
    } else if (upVector.x === 1) {
      return new Vector3(
        center.x + Math.max(size.x, size.z, size.y) * 2.5,
        center.y,
        0
      );
    } else {
      // assume z-up
      return new Vector3(
        center.x,
        0,
        center.z + Math.max(size.z, size.x, size.y) * 2.5
      );
    }
  }, [sceneBoundingBox, upVector]);

  const defaultCameraPositionComputed = useMemo(() => {
    /**
     * (todo: we should discard (2) since per-dataset camera position no longer makes sense)
     *
     * This is the order of precedence for the camera position:
     * 1. If the user has set a default camera position in the scene itself, use that
     * 2. If the user has set a default camera position in the plugin settings, use that
     * 3. Compute a default camera position based on the bounding box of the scene
     * 4. Use an arbitrary default camera position
     */

    if (isParsingFo3d) {
      return DEFAULT_CAMERA_POSITION();
    }

    const defaultCameraPosition = foScene?.cameraProps.position;

    if (defaultCameraPosition) {
      return new Vector3(
        defaultCameraPosition[0],
        defaultCameraPosition[1],
        defaultCameraPosition[2]
      );
    }

    if (settings.defaultCameraPosition) {
      return new Vector3(
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z
      );
    }

    if (sceneBoundingBox && Math.abs(sceneBoundingBox.max.x) !== Infinity) {
      const center = sceneBoundingBox.getCenter(new Vector3());
      const size = sceneBoundingBox.getSize(new Vector3());

      if (upVector.y === 1) {
        return new Vector3(
          center.x,
          center.y + Math.max(size.y / 2, 1.5),
          center.z + Math.max(size.x, size.y, size.z) * 2
        );
      } else if (upVector.x === 1) {
        return new Vector3(
          center.x + Math.max(size.x / 2, 1.5),
          center.y + Math.max(size.x, size.y, size.z) * 2,
          center.z
        );
      } else {
        // assume z-up
        return new Vector3(
          center.x,
          center.y - Math.max(size.x, size.y, size.z) * 2,
          center.z + Math.max(1.5, size.z / 2)
        );
      }
    }

    return DEFAULT_CAMERA_POSITION();
  }, [settings, isParsingFo3d, foScene, sceneBoundingBox, upVector]);

  const onCanvasCreated = useCallback(
    (state: RootState) => {
      cameraRef.current = state.camera as PerspectiveCamera;
    },
    [upVector]
  );

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      () => {
        set(activeNodeAtom, null);
        set(actionRenderListAtomFamily("fo3d"), []);
      },
    []
  );

  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.copy(defaultCameraPositionComputed);
      setSceneInitialized(true);
    }
  }, [defaultCameraPositionComputed]);

  useEffect(() => {
    resetActiveNode();
  }, [isSceneInitialized, resetActiveNode]);

  const canvasCameraProps = useMemo(() => {
    return {
      position: defaultCameraPositionComputed,
      up: upVector,
      aspect: foScene?.cameraProps.aspect,
      fov: foScene?.cameraProps.fov && 50,
      near: foScene?.cameraProps.near && 0.1,
      far: foScene?.cameraProps.far && 2000,
    };
  }, [foScene, upVector, defaultCameraPositionComputed]);

  const setActionBarItems = useSetRecoilState(
    actionRenderListAtomFamily("fo3d")
  );

  const onChangeView = useCallback(
    (view: "pov" | "top") => {
      if (
        !sceneBoundingBox ||
        !cameraRef.current ||
        !orbitControlsRef.current
      ) {
        return;
      }

      if (view === "top") {
        cameraRef.current.position.copy(topCameraPosition);
      } else {
        cameraRef.current.position.copy(defaultCameraPositionComputed);
      }

      const newLookAt = sceneBoundingBox.getCenter(new Vector3());

      orbitControlsRef.current.target.copy(newLookAt);
      orbitControlsRef.current.update();
    },
    [sceneBoundingBox, topCameraPosition, defaultCameraPositionComputed]
  );

  useHotkey(
    "KeyT",
    ({}) => {
      onChangeView("top");
    },
    [onChangeView]
  );

  useHotkey(
    "KeyE",
    ({}) => {
      onChangeView("pov");
    },
    [onChangeView]
  );

  useEffect(() => {
    if (!isSceneInitialized) {
      return;
    }

    // todo: find a better way of setting action bar items
    const addUniqueItems = (currentItems, newItems) => {
      const existingKeys = currentItems.map((item) => item[0]);
      return newItems
        .filter((item) => !existingKeys.includes(item[0]))
        .concat(currentItems);
    };

    setActionBarItems((items) => {
      const newItems = [
        [ACTION_GRID, []],
        [ACTION_SET_TOP_VIEW, [onChangeView]],
        [ACTION_SET_EGO_VIEW, [onChangeView]],
        [ACTION_VIEW_JSON, [jsonPanel, sample]],
        [ACTION_VIEW_HELP, [helpPanel]],
      ];
      return addUniqueItems(items, newItems);
    });
  }, [
    isSceneInitialized,
    onChangeView,
    jsonPanel,
    sample,
    helpPanel,
    setActionBarItems,
  ]);

  useEffect(() => {
    if (!orbitControlsRef.current) {
      return;
    }

    if (foScene?.cameraProps.lookAt?.length === 3) {
      orbitControlsRef.current.target.copy(
        new Vector3(
          foScene.cameraProps.lookAt[0],
          foScene.cameraProps.lookAt[1],
          foScene.cameraProps.lookAt[2]
        ).normalize()
      );
      return;
    }

    if (sceneBoundingBox && Math.abs(sceneBoundingBox.max.x) !== Infinity) {
      orbitControlsRef.current.target.copy(
        sceneBoundingBox.getCenter(new Vector3())
      );
    }
  }, [foScene, sceneBoundingBox]);

  if (isParsingFo3d) {
    return (
      <Canvas>
        <SpinningCube />
      </Canvas>
    );
  }

  return (
    <>
      <LevaContainer>
        <Leva
          theme={{
            colors: {
              accent1: VOXEL51_THEME_COLOR_MUTED,
              accent2: VOXEL51_THEME_COLOR,
              accent3: VOXEL51_COMPLEMENTARY_COLOR,
            },
          }}
          fill
          hideCopyButton
          flat
        />
      </LevaContainer>

      <Canvas
        id={CANVAS_WRAPPER_ID}
        camera={canvasCameraProps}
        onCreated={onCanvasCreated}
        onPointerMissed={resetActiveNode}
      >
        <Fo3dSceneContext.Provider
          value={{
            isSceneInitialized,
            upVector,
            sceneBoundingBox,
            pluginSettings: settings,
          }}
        >
          <Suspense fallback={<SpinningCube />}>
            <AdaptiveDpr pixelated />
            <AdaptiveEvents />
            <OrbitControls
              ref={orbitControlsRef}
              makeDefault
              minPolarAngle={0}
              maxPolarAngle={Math.PI}
            />
            <Lights lights={foScene?.lights} />
            <Gizmos />

            {!isSceneInitialized && <SpinningCube />}

            <group ref={assetsGroupRef} visible={isSceneInitialized}>
              <FoSceneComponent scene={foScene} />
            </group>

            <StatusTunnel.Out />

            <ThreeDLabels sampleMap={{ fo3d: sample }} />
          </Suspense>
        </Fo3dSceneContext.Provider>
      </Canvas>
      {/* <NodeInfoRootContainer>
        <NodeInfo />
      </NodeInfoRootContainer> */}
      <StatusBarRootContainer>
        <StatusBar cameraRef={cameraRef} />
      </StatusBarRootContainer>
    </>
  );
};
