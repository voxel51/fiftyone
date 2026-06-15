import type React from "react";

function isSpaceKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return (
    event.key === " " || event.key === "Spacebar" || event.code === "Space"
  );
}

// The modal reserves bare Space for playback. voodo's Checkbox is a Headless UI
// `role="checkbox"` whose Space-toggle fires on key *up*, so accidental focus in
// the settings sidebar would otherwise flip a label/source setting when the user
// means to play or pause. Cancelling the event suppresses that toggle: voodo
// merges consumer handlers ahead of its own and short-circuits the chain once
// `defaultPrevented` is set, so our preventDefault wins. We deliberately guard
// keyDown as well — it cancels Space's default page-scroll and any
// native-checkbox fallback — so don't drop it. Pointer/click toggles stay intact.
export function preventSettingsCheckboxSpaceToggle(
  event: React.KeyboardEvent<HTMLElement>
) {
  if (isSpaceKey(event)) {
    event.preventDefault();
  }
}

export const checkboxNoSpaceToggleProps = {
  onKeyDown: preventSettingsCheckboxSpaceToggle,
  onKeyUp: preventSettingsCheckboxSpaceToggle,
};
