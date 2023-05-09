import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
import Embeddings from "./Embeddings";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import EmbeddingsTabIndicator from "./EmbeddingsTabIndicator";
import {registerOperator} from "@fiftyone/operators";
import { OpenEmbeddingsPanel } from "./operators";

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
