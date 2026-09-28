import type { SelectionGesture } from "@fiftyone/state/src/selection";
import { useEffect, useSyncExternalStore } from "react";

/** macOS and iOS speak in ⌘ and ⌥; everything else in Ctrl and Alt. */
function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/** "⌘-click" or "Ctrl-click": the gesture that feeds a bucket, in the user's keys. */
export function gestureLabel(
  gesture: SelectionGesture,
  apple = isApplePlatform(),
) {
  if (gesture === "click") return "click";
  if (gesture === "command") return apple ? "⌘-click" : "Ctrl-click";
  return apple ? "⌥-click" : "Alt-click";
}

/** A modifier the user is holding down, so the tray can show where the next click lands. */
export type HeldGesture = Exclude<SelectionGesture, "click"> | null;

let held: HeldGesture = null;
const listeners = new Set<() => void>();

function publish(next: HeldGesture) {
  if (held === next) return;
  held = next;
  for (const listener of listeners) listener();
}

/** Derive the held gesture from a keyboard event's modifier flags. */
export function heldGestureOf(event: {
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}): HeldGesture {
  if (event.altKey) return "option";
  if (event.metaKey || event.ctrlKey) return "command";
  return null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getHeld = () => held;

/** The modifier currently held, or null. */
export function useHeldGesture(): HeldGesture {
  return useSyncExternalStore(subscribe, getHeld, () => null);
}

/**
 * Tracks modifier keys on the window while enabled. Modifier keys report
 * themselves on keydown and keyup, and losing focus releases everything,
 * since a keyup delivered to another window never arrives here.
 */
export function useTrackHeldGesture(enabled: boolean) {
  // This effect listens to the window because the modifier may be pressed
  // while the pointer is anywhere over the grid, not over a React element.
  useEffect(() => {
    if (!enabled) {
      publish(null);
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => publish(heldGestureOf(event));
    const release = () => publish(null);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
      publish(null);
    };
  }, [enabled]);
}
