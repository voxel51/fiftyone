export default function autoFocus({ autoFocused }) {
  const autoFocus = autoFocused.current === false;
  autoFocused.current = true;
  return autoFocus;
}
