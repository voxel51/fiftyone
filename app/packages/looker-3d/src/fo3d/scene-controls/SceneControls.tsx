import { folder, useControls } from "leva";
import { useMemo } from "react";
import { Vector3 } from "three";
import { PANEL_ORDER_SCENE_CONTROLS } from "../../constants";
import { FoScene } from "../../hooks";
import { useFo3dContext } from "../context";
import { getOrthonormalAxis } from "../utils";
import { Lights } from "./lights/Lights";

export const SceneControls = ({ scene }: { scene: FoScene }) => {
  const { upVector, setUpVector } = useFo3dContext();

  const dirFromUpVector = useMemo(
    () => getOrthonormalAxis(upVector),
    [upVector]
  );

  useControls(() => ({
    Scene: folder(
      {
        UpVector: {
          value: dirFromUpVector,
          label: "Up",
          options: ["X", "Y", "Z"],
          onChange: (value) => {
            if (value === "X") setUpVector(new Vector3(1, 0, 0));
            if (value === "Y") setUpVector(new Vector3(0, 1, 0));
            if (value === "Z") setUpVector(new Vector3(0, 0, 1));
          },
        },
      },
      { collapsed: true, order: PANEL_ORDER_SCENE_CONTROLS }
    ),
  }));

  return <Lights lights={scene?.lights} />;
};
