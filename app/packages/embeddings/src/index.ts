import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
import { Schema } from "@fiftyone/utilities";
import Map from "./Embeddings";

registerComponent({
  name: "Embeddings",
  label: "Embeddings",
  component: Map,
  type: PluginComponentType.Plot,
  activator: () => true,
});
