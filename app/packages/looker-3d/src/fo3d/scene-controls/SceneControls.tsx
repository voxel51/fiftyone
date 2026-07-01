import * as fos from "@fiftyone/state";
import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  DEFAULT_SELECTED_CUBOID_CROP_MARGIN,
  PANEL_ORDER_SCENE_CONTROLS,
} from "../../constants";
import { avoidZFightingAtom } from "../../state";
import { useFo3dContext } from "../context";
import type { FoScene } from "../render-types";
import {
  ORTHONORMAL_AXIS_OPTIONS,
  getOrthonormalAxis,
  getUpVectorFromAxis,
  saveCameraState,
} from "../utils";
import {
  getCameraControlsTarget,
  type Fo3dCameraControls,
} from "../camera-controls";
import { useCameraSelectorControls } from "./cameras/use-camera-selector-controls";
import { Lights } from "./lights/Lights";

export const SceneControls = ({
  scene,
  cameraControlsRef,
}: {
  scene: FoScene;
  cameraControlsRef?: React.RefObject<Fo3dCameraControls>;
}) => {
  const {
    upVector,
    setUpVector,
    autoRotate,
    setAutoRotate,
    pointCloudSettings,
    setPointCloudSettings,
    isSceneInitialized,
    isComputingSceneBoundingBox,
    lookAt,
  } = useFo3dContext();

  const datasetName = useRecoilValue(fos.datasetName);
  const [avoidZFighting, setAvoidZFighting] =
    useRecoilState(avoidZFightingAtom);
  const selectedCuboidCropMargin =
    pointCloudSettings.selectedCuboidCropMargin ??
    DEFAULT_SELECTED_CUBOID_CROP_MARGIN;

  const dirFromUpVector = useMemo(
    () => getOrthonormalAxis(upVector),
    [upVector],
  );

  const lastCameraUpdateRef = useRef(0);

  // Save frequently enough to survive quick mode switches after interactions.
  const CAMERA_UPDATE_INTERVAL = 50;

  useCameraSelectorControls({
    cameraControlsRef,
    lookAt,
  });

  useFrame((state) => {
    // Avoid persisting transient pre-init camera values.
    if (!isSceneInitialized || isComputingSceneBoundingBox) return;

    const now = Date.now();
    const cameraControls = cameraControlsRef?.current;
    if (
      state.camera &&
      cameraControls &&
      now - lastCameraUpdateRef.current > CAMERA_UPDATE_INTERVAL
    ) {
      saveCameraState(
        datasetName,
        state.camera.position.toArray(),
        getCameraControlsTarget(cameraControls).toArray(),
      );
      lastCameraUpdateRef.current = now;
    }
  });

  useControls(
    () => ({
      Scene: folder(
        {
          UpVector: {
            value: dirFromUpVector,
            label: "Up",
            options: ORTHONORMAL_AXIS_OPTIONS,
            onChange: (value) => {
              const nextUpVector = getUpVectorFromAxis(value);

              if (nextUpVector) {
                setUpVector(nextUpVector);
              }
            },
          },
          AutoRotate: {
            value: autoRotate,
            label: "Auto Rotate",
            onChange: (value) => {
              setAutoRotate(value);
            },
          },
          "Avoid Z fighting": {
            value: avoidZFighting,
            label: "Avoid Z fighting",
            onChange: (value) => {
              setAvoidZFighting(value);
            },
          },
        },
        { collapsed: true, order: PANEL_ORDER_SCENE_CONTROLS },
      ),
    }),
    [],
  );

  // note: we have to separate the scene controls from the point cloud controls
  // or else it'll cause unnecessary re-renders
  useControls(
    () => ({
      "Scene.PointCloud": folder({
        enableTooltip: {
          value: pointCloudSettings.enableTooltip,
          label: "Enable Tooltip",
          onChange: (value) => {
            setPointCloudSettings((prev) => ({
              ...prev,
              enableTooltip: value,
              selectedCuboidCropMargin:
                prev.selectedCuboidCropMargin ??
                DEFAULT_SELECTED_CUBOID_CROP_MARGIN,
            }));
          },
        },
        selectedCuboidCropMargin: {
          value: selectedCuboidCropMargin,
          label: "Selected Cuboid Crop Margin",
          min: 0,
          step: 0.1,
          onChange: (value: number) => {
            setPointCloudSettings((prev) => ({
              ...prev,
              selectedCuboidCropMargin: value,
            }));
          },
        },
      }),
    }),
    [
      pointCloudSettings.enableTooltip,
      selectedCuboidCropMargin,
      setPointCloudSettings,
    ],
  );

  return <Lights lights={scene?.lights} />;
};
