import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { defineCustomPanel } from "../CustomPanel";
import OperatorIcon from "../OperatorIcon";

export default function registerPanel(params) {
  registerComponent({
    type: PluginComponentType.Panel,
    name: params.panel_name,
    component: defineCustomPanel(params),
    label: params.panel_label,
    activator: () => true,
    Icon: () => {
      return (
        <OperatorIcon
          icon={params.icon || "extension"}
          darkIcon={params.dark_icon}
          lightIcon={params.light_icon}
          iconProps={{ sx: { fontSize: 14, mr: "0.5rem" } }}
          _builtIn={params._builtin}
          canExecute={true}
        />
      );
    },
    panelOptions: {
      allowDuplicates: params.allow_duplicates,
      helpMarkdown: params.help_markdown,
      surfaces: params.surfaces,
      alpha: params.alpha,
      beta: params.beta,
      category: params.category,
      isNew: params.is_new,
      priority: params.priority,
    },
  });
}
