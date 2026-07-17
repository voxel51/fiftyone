import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Global user preference for the annotation timeline drawer's open state.
// Persisted so it survives the surface remount on every sample switch / mode
// toggle instead of resetting to the mount-time default.
const timelineDrawerOpenAtom = atomWithStorage("HA.timelineDrawerOpen", false);

/**
 * Read/write the persisted annotation timeline drawer open state. Wire the
 * value and setter into `TimelineWithTracks`'s controlled `drawerOpen` /
 * `onDrawerOpenChange` so the choice sticks across samples.
 */
export const useTimelineDrawerOpen = () => useAtom(timelineDrawerOpenAtom);
