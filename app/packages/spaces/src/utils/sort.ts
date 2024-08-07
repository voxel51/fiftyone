import { PluginComponentRegistration } from "@fiftyone/plugins";

export function panelsCompareFn(
  panelA: PluginComponentRegistration,
  panelB: PluginComponentRegistration
) {
  const panelAPriority = panelA?.panelOptions?.priority || 0;
  const panelBPriority = panelB?.panelOptions?.priority || 0;
  if (panelAPriority !== panelBPriority) {
    return panelBPriority - panelAPriority;
  }
  if (panelA.name < panelB.name) return -1;
  if (panelA.name > panelB.name) return 1;
  return 0;
}
