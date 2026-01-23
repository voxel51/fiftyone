interface ShortcutItem {
  shortcut: string;
  title?: string;
  detail?: string;
}

const MEDIA_FIELD_SHORTCUTS: ShortcutItem[] = [
  {
    shortcut: "PageUp",
    title: "Previous media field",
    detail: "Switch to the previous media field",
  },
  {
    shortcut: "PageDown",
    title: "Next media field",
    detail: "Switch to the next media field",
  },
];

export function getMediaFieldShortcuts(
  hasMultipleMediaFields: boolean
): ShortcutItem[] {
  return hasMultipleMediaFields ? MEDIA_FIELD_SHORTCUTS : [];
}

type Shortcuts = { [key: string]: ShortcutItem };

export function shortcutToHelpItems(SHORTCUTS: Shortcuts) {
  const uniqueItems: Record<string, ShortcutItem> = {};
  for (const item of Object.values(SHORTCUTS)) {
    uniqueItems[item.shortcut] = item;
  }
  return Object.values(uniqueItems);
}
