export default function autoFocus({ autoFocused }) {
  if (!autoFocused) return;
  const autoFocus = autoFocused.current === false;
  autoFocused.current = true;
  return autoFocus;
}
