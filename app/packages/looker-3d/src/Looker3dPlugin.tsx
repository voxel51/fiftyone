import { Looker3d } from "./Looker3d";
import { registerComponent, PluginComponentType } from "@fiftyone/plugins";

typeof window !== "undefined" &&
  registerComponent({
    name: "Looker3d",
    component: Looker3d,
    type: PluginComponentType.Visualizer,
    activator: ({ sample }) => sample && sample.filepath.endsWith(".pcd"),
  });
