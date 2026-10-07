import { ViewPropsType } from "./types";

export default function autoFocus({
  autoFocused,
}: Pick<ViewPropsType, "autoFocused">) {
  if (!autoFocused) return undefined;
  const autoFocus = autoFocused.current === false;
  autoFocused.current = true;
  return autoFocus;
}
