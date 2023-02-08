import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
import Embeddings from "./Embeddings";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";

registerComponent({
  name: "Embeddings",
  label: "Embeddings",
  component: Embeddings,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: ScatterPlotIcon,
});
