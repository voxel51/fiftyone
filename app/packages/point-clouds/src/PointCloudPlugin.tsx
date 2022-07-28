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
    const settings = usePluginSettings("point-clouds");
    const field = getFilepathField(sample, settings.filepathFields);

    if (isGroupMainView) return false;
    return field !== null;
  },
});
