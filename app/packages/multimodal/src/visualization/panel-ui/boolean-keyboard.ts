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
// accidental focus would otherwise flip a setting when the user means to play
// or pause. voodo runs consumer handlers first and stops once defaultPrevented
// is set. Guarding keyDown also prevents page scrolling; Enter keeps an explicit
// click fallback so guarded controls remain keyboard-accessible.
export function preventBooleanSpaceToggle(
  event: React.KeyboardEvent<HTMLElement>,
): void {
  if (isSpaceKey(event)) {
    event.preventDefault();
  }
}

function handleBooleanKeyUp(event: React.KeyboardEvent<HTMLElement>): void {
  if (isSpaceKey(event)) {
    event.preventDefault();
    return;
  }
  if (isEnterKey(event)) {
    event.preventDefault();
    event.currentTarget.click();
  }
}

/** Keyboard handlers for boolean controls that must leave Space to playback. */
export const booleanNoSpaceToggleProps = {
  onKeyDown: preventBooleanSpaceToggle,
  onKeyUp: handleBooleanKeyUp,
};
