import { ViewPropsType } from "./types";

export default function autoFocus({ autoFocused }: ViewPropsType) {
  if (!autoFocused) return undefined;
  const autoFocus = autoFocused.current === false;
  autoFocused.current = true;
  return autoFocus;
}
