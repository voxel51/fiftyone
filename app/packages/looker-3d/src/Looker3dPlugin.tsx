import { Looker3d, getFilepathField } from "./Looker3d";
import {
  registerComponent,
  PluginComponentType,
  usePluginSettings,
} from "@fiftyone/plugins";

registerComponent({
  name: "Looker3d",
  component: Looker3d,
  type: PluginComponentType.Visualizer,
  activator: ({ sample, pinned }) => {
    if (!sample) return false;
    const settings = usePluginSettings("3d");
    const field = getFilepathField(sample, settings.filepathFields);
    return field !== null;
  },
});
