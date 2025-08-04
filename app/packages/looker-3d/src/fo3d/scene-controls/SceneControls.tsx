import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import { PANEL_ORDER_SCENE_CONTROLS } from "../../constants";
import { CAMERA_POSITION_KEY } from "../../Environment";
import { FoScene } from "../../hooks";
import { useFo3dContext } from "../context";
import { getOrthonormalAxis } from "../utils";
import { Lights } from "./lights/Lights";

export const SceneControls = ({ scene }: { scene: FoScene }) => {
  const {
    upVector,
    setUpVector,
    autoRotate,
    setAutoRotate,
    pointCloudSettings,
    setPointCloudSettings,
  } = useFo3dContext();

  const dirFromUpVector = useMemo(
    () => getOrthonormalAxis(upVector),
    [upVector]
  );

  const lastCameraUpdateRef = useRef(0);

  // save every half second to avoid excessive writes
  const CAMERA_UPDATE_INTERVAL = 500;

  useFrame((state) => {
    const now = Date.now();

    if (
      state.camera &&
      now - lastCameraUpdateRef.current > CAMERA_UPDATE_INTERVAL
    ) {
      window?.localStorage.setItem(
        CAMERA_POSITION_KEY,
        JSON.stringify(state.camera.position.toArray())
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
