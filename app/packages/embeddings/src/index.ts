import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import Embeddings from "./Embeddings";
import EmbeddingsTabIndicator from "./EmbeddingsTabIndicator";

registerComponent({
  name: "Embeddings",
  label: "Embeddings",
  component: Embeddings,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: ScatterPlotIcon,
  panelOptions: {
    TabIndicator: EmbeddingsTabIndicator,
  },
});

// registerOperator(new OpenEmbeddingsPanel());
