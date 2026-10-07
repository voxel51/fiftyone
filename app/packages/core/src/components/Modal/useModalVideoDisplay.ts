import { useAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { useCallback } from "react";

type Display = "configured" | "duration";

// SSR has no `window`, and restricted browsers (sandboxed iframes, blocked
// cookies) throw on the storage accessor itself; `undefined` keeps the atom
// in-memory in both cases.
const guardedLocalStorage = (): Storage | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * Whether the modal's video readout shows frame numbers rather than
 * timecode. Timecode until the user first toggles it, as on the looker.
 */
const modalVideoUseFrameNumber = atomWithStorage<boolean>(
  "fo-modal-video-use-frame-number",
  false,
  createJSONStorage<boolean>(guardedLocalStorage),
  // read before the first render, so the provider seeds the stored choice
  { getOnInit: true },
);

/**
 * Frame-number vs. timecode for the modal's video timeline, carried across
 * samples and reloads. Every sample mounts a fresh `PlaybackProvider`, whose
 * display state would otherwise reopen on timecode each time; spread the
 * result onto the provider to seed it and record the user's toggles.
 */
export const useModalVideoDisplay = (): {
  defaultDisplay: Display;
  onDisplayChange: (display: Display) => void;
} => {
  const [useFrameNumber, setUseFrameNumber] = useAtom(modalVideoUseFrameNumber);
  const onDisplayChange = useCallback(
    (display: Display) => setUseFrameNumber(display === "configured"),
    [setUseFrameNumber],
  );

  return {
    defaultDisplay: useFrameNumber ? "configured" : "duration",
    onDisplayChange,
  };
};
