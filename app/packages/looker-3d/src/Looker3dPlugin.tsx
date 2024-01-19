import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { Looker3d } from "./Looker3d";

export type Looker3dPluginSettings = {
  useLegacyCoordinates: boolean;
  defaultUp: THREE.Vector3Tuple;
  defaultCameraPosition: THREE.Vector3;
};

export const defaultPluginSettings: Partial<Looker3dPluginSettings> = {
  useLegacyCoordinates: false,
  defaultUp: [0, 0, 1],
};

typeof window !== "undefined" &&
  registerComponent({
    name: "Looker3d",
    component: Looker3d,
    type: PluginComponentType.Visualizer,
    activator: ({ dataset }) =>
      dataset.mediaType ??
      dataset.groupMediaTypes.find(
        (g) => g.mediaType === "point_cloud" || g.mediaType === "three_d"
      ) !== undefined,
  });
