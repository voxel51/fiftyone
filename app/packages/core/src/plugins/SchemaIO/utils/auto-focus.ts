import { ViewPropsType } from "./types";

export default function autoFocus({ autoFocused }: ViewPropsType) {
  if (!autoFocused) return;
  const autoFocus = autoFocused.current === false;
  autoFocused.current = true;
  return autoFocus;
}
