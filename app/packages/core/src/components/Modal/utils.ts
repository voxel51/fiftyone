// Multimodal viewers use their own right-panel tabs (Inspect/Fields) and
// don't populate the classic sidebar's projection/aggregation data, so
// mounting it here would only fire redundant queries.
export const shouldShowClassicSidebar = (
  isSidebarVisible: boolean,
  isMultimodal: boolean,
): boolean => isSidebarVisible && !isMultimodal;

interface ShortcutItem {
  shortcut: string;
}

type Shortcuts = { [key: string]: ShortcutItem };

export function shortcutToHelpItems(SHORTCUTS: Shortcuts) {
  const uniqueItems = {};
  for (const item of Object.values(SHORTCUTS)) {
    uniqueItems[item.shortcut] = item;
  }
  return Object.values(uniqueItems);
}
