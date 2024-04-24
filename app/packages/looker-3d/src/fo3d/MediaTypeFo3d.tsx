import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { AdaptiveDpr, AdaptiveEvents, CameraControls } from "@react-three/drei";
import { Canvas, RootState } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import * as THREE from "three";
import { PerspectiveCamera, Vector3 } from "three";
import { Looker3dPluginSettings } from "../Looker3dPlugin";
import { SpinningCube } from "../SpinningCube";
import { StatusBar, StatusTunnel } from "../StatusBar";
import { DEFAULT_CAMERA_POSITION } from "../constants";
import { StatusBarRootContainer } from "../containers";
import { useFo3d, useHotkey } from "../hooks";
import { useFo3dBounds } from "../hooks/use-bounds";
import { ThreeDLabels } from "../labels";
import { activeNodeAtom, isFo3dBackgroundOnAtom } from "../state";
import { FoSceneComponent } from "./FoScene";
import { Gizmos } from "./Gizmos";
import Leva from "./Leva";
import { Fo3dSceneContext } from "./context";
import { Lights } from "./lights/Lights";
import {
  getFo3dRoot,
  getMediaUrlForFo3dSample,
  getOrthonormalAxis,
} from "./utils";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

export const MediaTypeFo3dComponent = () => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  const settings = usePluginSettings<Looker3dPluginSettings>("3d");

  const mediaUrl = useMemo(
    () => getMediaUrlForFo3dSample(sample, mediaField),
    [mediaField, sample]
  );

  const fo3dRoot = useMemo(() => getFo3dRoot(mediaUrl), [mediaUrl]);

  const { foScene, isLoading: isParsingFo3d } = useFo3d(
    mediaUrl,
    sample.sample.filepath,
    fo3dRoot
  );

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

    if (settings.defaultUp) {
      const maybeOrthonormalAxis = getOrthonormalAxis(settings.defaultUp);

      if (maybeOrthonormalAxis) {
        return new Vector3(
          settings.defaultUp[0],
          settings.defaultUp[1],
          settings.defaultUp[2]
        );
      }
    }

    // default to y-up
    return new Vector3(0, 1, 0);
  }, [foScene, settings]);

  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const cameraControlsRef = useRef<CameraControls>();

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

  const onCanvasCreated = useCallback((state: RootState) => {
    cameraRef.current = state.camera as PerspectiveCamera;
  }, []);

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      () => {
        set(activeNodeAtom, null);
      },
    []
  );

  useEffect(() => {
    if (cameraRef.current) {
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
      far: foScene?.cameraProps.far && 2500,
    };
  }, [foScene, upVector, defaultCameraPositionComputed]);

  const onChangeView = useCallback(
    (view: "pov" | "top", useAnimation = true) => {
      if (
        !sceneBoundingBox ||
        !cameraRef.current ||
        !cameraControlsRef.current
      ) {
        return;
      }

      let newCameraPosition = [
        defaultCameraPositionComputed.x,
        defaultCameraPositionComputed.y,
        defaultCameraPositionComputed.z,
      ] as const;

      if (view === "top") {
        newCameraPosition = [
          topCameraPosition.x,
          topCameraPosition.y,
          topCameraPosition.z,
        ];
      }

      const boundingBoxCenter = sceneBoundingBox.getCenter(new Vector3());
      const newLookAt = [
        boundingBoxCenter.x,
        boundingBoxCenter.y,
        boundingBoxCenter.z,
      ] as const;

      cameraControlsRef.current.setLookAt(
        ...newCameraPosition,
        ...newLookAt,
        useAnimation
      );
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
    if (!cameraControlsRef.current) {
      return;
    }

    if (foScene?.cameraProps.lookAt?.length === 3) {
      cameraControlsRef.current.setTarget(
        foScene.cameraProps.lookAt[0],
        foScene.cameraProps.lookAt[1],
        foScene.cameraProps.lookAt[2]
      );
      return;
    } else {
      onChangeView("pov", false);
    }
  }, [foScene, onChangeView]);

  if (isParsingFo3d) {
    return (
      <Canvas>
        <SpinningCube />
      </Canvas>
    );
  }

  return (
    <>
      <Leva />
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
            fo3dRoot,
            sceneBoundingBox,
            pluginSettings: settings,
          }}
        >
          <Suspense fallback={<SpinningCube />}>
            <AdaptiveDpr pixelated />
            <AdaptiveEvents />
            <CameraControls ref={cameraControlsRef} makeDefault />
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
      <StatusBarRootContainer>
        <StatusBar cameraRef={cameraRef} />
      </StatusBarRootContainer>
    </>
  );
};
