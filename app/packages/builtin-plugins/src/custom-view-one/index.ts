import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import CustomViewOne from "./CustomViewOne";
import "./RecoilStateOp";

registerComponent({
  name: "CustomViewOne",
  label: "CustomViewOne",
  component: CustomViewOne,
  type: PluginComponentType.Component,
  activator: () => true,
});
