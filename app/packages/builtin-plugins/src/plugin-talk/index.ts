import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import PluginTalk from "./PluginTalk";
import "./RecoilStateOperator";

registerComponent({
  name: "PluginTalk",
  label: "PluginTalk",
  component: PluginTalk,
  type: PluginComponentType.Component,
  activator: () => true,
});
