import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";

/** e2e specs wait on what the selection tray and its panels have committed */
export type SelectionE2EEvents = {
  "e2e:selection:tray-shown": {
    loading: boolean;
    explicit: boolean;
    error: string | null;
    /** Captures in the target bucket, the cards its strip shows */
    cards: number;
    /** Captures per bucket, comma separated */
    buckets: string;
    episodes: number;
    fullEpisodes: number;
    segments: number;
    segmentEpisodes: number;
    groups: number;
    outside: number;
  };
  "e2e:selection:scope-shown": { label: string; facet: string; count: string };
  "e2e:selection:subsets-listed": { count: number; error: string | null };
  "e2e:selection:subset-job": {
    subsetName: string;
    state: string;
    result: boolean;
  };
  "e2e:selection:tags-shown": {
    target: string;
    busy: boolean;
    /** Tags every target carries, newline separated */
    all: string;
    error: string | null;
  };
  "e2e:selection:saved-segments-shown": {
    sampleId: string;
    count: number;
    loading: boolean;
    title: string;
  };
};

/**
 * Dispatch `event` with `detail` after the commit that shows it, and again
 * whenever `detail` changes; nothing while `detail` is null
 */
export function useSelectionShownSignal<E extends keyof SelectionE2EEvents>(
  event: E,
  detail: SelectionE2EEvents[E] | null,
) {
  const key = detail && JSON.stringify(detail);
  useEffect(() => {
    if (key === null) return;
    getEventBus<Record<string, object>>().dispatch(event, JSON.parse(key));
  }, [event, key]);
}
