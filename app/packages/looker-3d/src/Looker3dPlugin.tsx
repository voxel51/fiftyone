import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { Looker3d } from "./Looker3d";

export type ThreeDPluginSettings = {
  useLegacyCoordinates: boolean;
  defaultUp: THREE.Vector3Tuple;
  defaultCameraPosition: THREE.Vector3;
};

typeof window !== "undefined" &&
  registerComponent({
    name: "Looker3d",
    component: Looker3d,
    type: PluginComponentType.Visualizer,
    activator: ({ sample }) => sample && sample.filepath.endsWith(".pcd"),
  });
