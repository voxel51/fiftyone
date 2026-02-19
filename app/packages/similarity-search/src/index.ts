import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import SimilaritySearchView from "./components/SimilaritySearchView";

registerComponent({
  name: "SimilaritySearchView",
  label: "SimilaritySearchView",
  component: SimilaritySearchView,
  type: PluginComponentType.Component,
  activator: () => true,
});
