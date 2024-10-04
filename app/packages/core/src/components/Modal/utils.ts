export function shortcutToHelpItems(SHORTCUTS) {
  const result = {};
  for (const k of SHORTCUTS) {
    result[SHORTCUTS[k].shortcut] = SHORTCUTS[k];
  }
  return Object.values(result);
}
