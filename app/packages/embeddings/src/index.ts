import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
import Map from "./Embeddings";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";

registerComponent({
  name: "Embeddings",
  label: "Embeddings",
  component: Map,
  type: PluginComponentType.Plot,
  activator: () => true,
  Icon: ScatterPlotIcon,
});
