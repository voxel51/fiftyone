import * as fos from "@fiftyone/state";
import { CameraControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Vector3 } from "three";
import { PANEL_ORDER_SCENE_CONTROLS } from "../../constants";
import { FoScene } from "../../hooks";
import { avoidZFightingAtom } from "../../state";
import { useFo3dContext } from "../context";
import { getCameraPositionKey, getOrthonormalAxis } from "../utils";
import { Lights } from "./lights/Lights";

export const SceneControls = ({
  scene,
  cameraControlsRef,
}: {
  scene: FoScene;
  cameraControlsRef?: React.RefObject<CameraControls>;
}) => {
  const {
    upVector,
    setUpVector,
    autoRotate,
    setAutoRotate,
    pointCloudSettings,
    setPointCloudSettings,
    isComputingSceneBoundingBox,
  } = useFo3dContext();

  const datasetName = useRecoilValue(fos.datasetName);
  const [avoidZFighting, setAvoidZFighting] =
    useRecoilState(avoidZFightingAtom);

  const dirFromUpVector = useMemo(
    () => getOrthonormalAxis(upVector),
    [upVector]
  );

  const lastCameraUpdateRef = useRef(0);

  // save every quarter second to avoid excessive writes
  const CAMERA_UPDATE_INTERVAL = 250;

  useFrame((state) => {
    if (isComputingSceneBoundingBox) return;

    const now = Date.now();
    const cameraControls = cameraControlsRef?.current;
    if (
      state.camera &&
      cameraControls &&
      now - lastCameraUpdateRef.current > CAMERA_UPDATE_INTERVAL
    ) {
      const cameraState = {
        position: state.camera.position.toArray(),
        target: cameraControls.getTarget(new Vector3()).toArray(),
      };
      window?.localStorage.setItem(
        getCameraPositionKey(datasetName),
        JSON.stringify(cameraState)
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
            options: ["X", "Y", "Z", "-X", "-Y", "-Z"],
            onChange: (value) => {
              if (value === "X") setUpVector(new Vector3(1, 0, 0));
              if (value === "Y") setUpVector(new Vector3(0, 1, 0));
              if (value === "Z") setUpVector(new Vector3(0, 0, 1));
              if (value === "-X") setUpVector(new Vector3(-1, 0, 0));
              if (value === "-Y") setUpVector(new Vector3(0, -1, 0));
              if (value === "-Z") setUpVector(new Vector3(0, 0, -1));
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
        { collapsed: true, order: PANEL_ORDER_SCENE_CONTROLS }
      ),
    }),
    []
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
            setPointCloudSettings({
              ...pointCloudSettings,
              enableTooltip: value,
            });
          },
        },
        rayCastingSensitivity: {
          value: pointCloudSettings.rayCastingSensitivity,
          label: "Ray Casting Sensitivity",
          options: ["high", "medium", "low"],
          onChange: (value) => {
            setPointCloudSettings({
              ...pointCloudSettings,
              rayCastingSensitivity: value,
            });
          },
          render: () => pointCloudSettings.enableTooltip,
        },
      }),
    }),
    [pointCloudSettings.enableTooltip]
  );

  return <Lights lights={scene?.lights} />;
};
