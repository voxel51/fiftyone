import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import CustomViewOne from "./CustomViewOne";

registerComponent({
  name: "CustomViewOne",
  label: "CustomViewOne",
  component: CustomViewOne,
  type: PluginComponentType.Component,
  activator: () => true,
});
