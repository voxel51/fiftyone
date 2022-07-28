import { PointCloud, getFilepathField } from "./PointCloud";
import {
  registerComponent,
  PluginComponentType,
  usePluginSettings,
} from "@fiftyone/plugins";

registerComponent({
  name: "PointCloud",
  component: PointCloud,
  type: PluginComponentType.Visualizer,
  activator: ({ sample, pinned, isGroupMainView }) => {
    if (isGroupMainView) return false;
    const settings = usePluginSettings("point-clouds");
    const field = getFilepathField(sample, settings.filepathFields);
    return field !== null;
  },
});
