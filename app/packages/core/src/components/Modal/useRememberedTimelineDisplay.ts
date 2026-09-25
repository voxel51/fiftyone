import { useTimelineModeControl } from "@fiftyone/playback";
import { useAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { useEffect, useRef } from "react";

/**
 * The clock domain the user last picked on the video Explore surface, or
 * `null` before they have picked one. Session-scoped: the surface remounts
 * per sample (`ModalSampleRenderer` keys on the sample id), which resets the
 * provider's own display state, so without this the readout snapped back to
 * the default on every sample change.
 */
type RememberedDisplay = "duration" | "sequence" | null;

const guardedSessionStorage = (): Storage | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

const rememberedTimelineDisplayAtom = atomWithStorage<RememberedDisplay>(
  "fo-video-explore-timeline-display",
  null,
  createJSONStorage<RememberedDisplay>(guardedSessionStorage),
  { getOnInit: true },
);

/**
 * Keeps the timeline's clock domain (timecode vs frame number) across sample
 * changes on the video Explore surface.
 *
 * On mount, re-applies the user's last pick if they have made one; the
 * surface's own default applies otherwise. Afterwards, records every change
 * the user makes. Must be mounted inside the surface's `PlaybackProvider`.
 */
export const useRememberedTimelineDisplay = (): void => {
  const { mode, configuredMode, canToggle, setMode } = useTimelineModeControl();
  const [remembered, setRemembered] = useAtom(rememberedTimelineDisplayAtom);

  // Re-apply once per provider. The provider's `displayMode` is state, so
  // this has to be an effect rather than an initial value.
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current || !canToggle) return;
    appliedRef.current = true;
    if (remembered === null || remembered === mode.kind) return;
    setMode(remembered === "duration" ? { kind: "duration" } : configuredMode);
  }, [canToggle, remembered, mode.kind, configuredMode, setMode]);

  // Record the user's picks — not the opening default, which is why the
  // first observed mode is skipped.
  const seenRef = useRef<RememberedDisplay>(null);
  useEffect(() => {
    if (!canToggle) return;
    const kind = mode.kind === "duration" ? "duration" : "sequence";
    if (seenRef.current === null) {
      seenRef.current = kind;
      return;
    }
    if (seenRef.current === kind) return;
    seenRef.current = kind;
    setRemembered(kind);
  }, [canToggle, mode.kind, setRemembered]);
};
