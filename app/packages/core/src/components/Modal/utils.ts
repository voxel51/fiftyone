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
