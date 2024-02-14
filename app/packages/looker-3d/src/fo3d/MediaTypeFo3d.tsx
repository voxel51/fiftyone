import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { OrbitControls } from "@react-three/drei";
import { Canvas, RootState } from "@react-three/fiber";
import { Leva } from "leva";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { Box3, Object3D, PerspectiveCamera, Vector3 } from "three";
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
import { useFo3d } from "../hooks";
import { ThreeDLabels } from "../labels";
import { actionRenderListAtomFamily } from "../state";
import { Fo3dEnvironment } from "./Environment";
import { FoScene } from "./FoScene";
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

  const { sceneGraph: foSceneGraph, isLoading: isParsingFo3d } =
    useFo3d(mediaUrl);

  const upVector = useMemo(() => {
    if (settings?.defaultUp?.length === 3) {
      return new Vector3(...settings.defaultUp).normalize();
    }

    // default to z-up (three.js default is y-up)
    return new Vector3(0, 0, 1);
  }, [settings]);

  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const orbitControlsRef = useRef<OrbitControlsImpl>();

  const onCanvasCreated = useCallback((state: RootState) => {
    cameraRef.current = state.camera as PerspectiveCamera;
  }, []);

  const [sceneBoundingBox, setSceneBoundingBox] = useState<Box3>();

  const topCameraPosition = useMemo(() => {
    if (!sceneBoundingBox || Math.abs(sceneBoundingBox.max.x) === Infinity) {
      return DEFAULT_CAMERA_POSITION();
    }

    const center = sceneBoundingBox.getCenter(new Vector3());
    const size = sceneBoundingBox.getSize(new Vector3());
    if (upVector.y === 1) {
      return new Vector3(
        center.x,
        center.y + Math.max(size.y, size.x) * 2.5,
        0
      );
    } else if (upVector.x === 1) {
      return new Vector3(
        center.x + Math.max(size.x, size.z) * 2.5,
        center.y,
        0
      );
    } else {
      // assume z-up
      return new Vector3(
        center.x,
        0,
        center.z + Math.max(size.z, size.x) * 2.5
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

    const defaultCameraPosition = foSceneGraph.defaultCameraPosition;

    if (defaultCameraPosition) {
      return new Vector3(
        defaultCameraPosition.x,
        defaultCameraPosition.y,
        defaultCameraPosition.z
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
          center.y + Math.max(size.x, size.y, size.z) * 2,
          center.z + Math.max(1.5, size.z / 2)
        );
      }
    }

    return DEFAULT_CAMERA_POSITION();
  }, [settings, isParsingFo3d, foSceneGraph, sceneBoundingBox]);

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
    [sceneBoundingBox, topCameraPosition]
  );

  useEffect(() => {
    setActionBarItems([
      [ACTION_GRID, []],
      [ACTION_SET_TOP_VIEW, [onChangeView]],
      [ACTION_SET_EGO_VIEW, [onChangeView]],
      [ACTION_VIEW_JSON, [jsonPanel, sample]],
      [ACTION_VIEW_HELP, [helpPanel]],
    ]);
  }, [onChangeView, jsonPanel, sample, helpPanel, setActionBarItems]);

  useEffect(() => {
    Object3D.DEFAULT_UP = upVector.clone();
  }, [settings]);

  useEffect(() => {
    if (
      sceneBoundingBox &&
      Math.abs(sceneBoundingBox.max.x) !== Infinity &&
      orbitControlsRef.current
    ) {
      orbitControlsRef.current.target.copy(
        sceneBoundingBox.getCenter(new Vector3())
      );
    }
  }, [sceneBoundingBox]);

  const assetsGroupRef = useRef<THREE.Group>();

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
        camera={{ position: defaultCameraPositionComputed, up: upVector }}
        onCreated={onCanvasCreated}
      >
        <Suspense fallback={<SpinningCube />}>
          <Fo3dEnvironment
            assetsGroupRef={assetsGroupRef}
            upVector={upVector}
            sceneBoundingBox={sceneBoundingBox}
            setSceneBoundingBox={setSceneBoundingBox}
          />
          <OrbitControls
            ref={orbitControlsRef}
            makeDefault
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 1.75}
          />

          <group ref={assetsGroupRef} visible={Boolean(sceneBoundingBox)}>
            <FoScene scene={foSceneGraph} />
          </group>
          <StatusTunnel.Out />
          <ThreeDLabels sampleMap={{ fo3d: sample }} />
        </Suspense>
      </Canvas>
      <StatusBarRootContainer>
        <StatusBar cameraRef={cameraRef} />
      </StatusBarRootContainer>
    </>
  );
};
