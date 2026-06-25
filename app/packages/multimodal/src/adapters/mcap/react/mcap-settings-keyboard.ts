import type React from "react";

function isSpaceKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return (
    event.key === " " || event.key === "Spacebar" || event.code === "Space"
  );
}

function isEnterKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return event.key === "Enter" || event.code === "Enter";
}

// The modal reserves bare Space for playback. voodo's Checkbox is a Headless UI
// `role="checkbox"` whose Space-toggle fires on key *up*, so accidental focus in
// the settings sidebar would otherwise flip a label/source setting when the user
// means to play or pause. Cancelling the event suppresses that toggle: voodo
// merges consumer handlers ahead of its own and short-circuits the chain once
// `defaultPrevented` is set, so our preventDefault wins. We deliberately guard
// keyDown as well; it cancels Space's default page-scroll and any
// native-checkbox fallback, so don't drop it. Enter gets an explicit click
// fallback on keyUp so keyboard users can still toggle these guarded checkboxes.
// Pointer/click toggles stay intact.
export function preventSettingsCheckboxSpaceToggle(
  event: React.KeyboardEvent<HTMLElement>
) {
  if (isSpaceKey(event)) {
    event.preventDefault();
  }
}

function handleSettingsCheckboxKeyUp(event: React.KeyboardEvent<HTMLElement>) {
  if (isSpaceKey(event)) {
    event.preventDefault();
    return;
  }
  if (isEnterKey(event)) {
    event.preventDefault();
    event.currentTarget.click();
  }
}

export const checkboxNoSpaceToggleProps = {
  onKeyDown: preventSettingsCheckboxSpaceToggle,
  onKeyUp: handleSettingsCheckboxKeyUp,
};
