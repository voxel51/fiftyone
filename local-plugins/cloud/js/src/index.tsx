/**
 * Bundle entry point. Registers the one component `CloudPanel.render`
 * names; the panel itself is declared in `fiftyone.yml`.
 */

import { PluginComponentType, registerComponent } from "@fiftyone/plugins";

import { CloudPanelView } from "./CloudPanelView";

registerComponent({
  name: "CloudPanelView",
  label: "FiftyOne Cloud",
  component: CloudPanelView,
  type: PluginComponentType.Component,
  activator: () => true,
});
