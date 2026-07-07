import type React from "react";

function isSpaceKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return (
    event.key === " " || event.key === "Spacebar" || event.code === "Space"
  );
}

function isEnterKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return event.key === "Enter" || event.code === "Enter";
}

// The modal reserves bare Space for playback. voodo's boolean controls are
// Headless UI checkbox/switch controls whose Space-toggle fires on key *up*, so
// accidental focus in the settings sidebar would otherwise flip a setting when
// the user means to play or pause. Cancelling the event suppresses that toggle:
// voodo merges consumer handlers ahead of its own and short-circuits the chain
// once `defaultPrevented` is set, so our preventDefault wins. We deliberately
// guard keyDown as well; it cancels Space's default page-scroll and any native
// fallback, so don't drop it. Enter gets an explicit click fallback on keyUp so
// keyboard users can still toggle these guarded controls. Pointer/click toggles
// stay intact.
export function preventSettingsBooleanSpaceToggle(
  event: React.KeyboardEvent<HTMLElement>,
) {
  if (isSpaceKey(event)) {
    event.preventDefault();
  }
}

function handleSettingsBooleanKeyUp(event: React.KeyboardEvent<HTMLElement>) {
  if (isSpaceKey(event)) {
    event.preventDefault();
    return;
  }
  if (isEnterKey(event)) {
    event.preventDefault();
    event.currentTarget.click();
  }
}

export const settingsBooleanNoSpaceToggleProps = {
  onKeyDown: preventSettingsBooleanSpaceToggle,
  onKeyUp: handleSettingsBooleanKeyUp,
};

export const preventSettingsCheckboxSpaceToggle =
  preventSettingsBooleanSpaceToggle;

export const checkboxNoSpaceToggleProps = settingsBooleanNoSpaceToggleProps;
