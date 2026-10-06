import { useRecoilTransactionObserver_UNSTABLE, useRecoilValue } from "recoil";
import { useEffect, useState, useCallback } from "react";
import * as fos from "@fiftyone/state";
import { analyticsInfo, useTrackEvent } from "@fiftyone/analytics";

type ViewChanges = {
  view?: string[];
  extendedStages?: string[];
  count?: number;
  filters?: string[];
};

const useTrackViewChanges = () => {
  const [changes, setChanges] = useState<ViewChanges>({});
  const [lastTracked, setLastTracked] = useState(0);
  const debounceTime = 500;

  const handleStateChange = useCallback(
    ({ snapshot }) => {
      const newChanges: ViewChanges = {};
      const view = snapshot.getLoadable(fos.view)?.contents;
      const extendedStages = snapshot.getLoadable(fos.extendedStages)?.contents;
      const count = snapshot.getLoadable(
        fos.count({ path: "", extended: false, modal: false }),
      )?.contents;
      const filters = snapshot.getLoadable(fos.filters)?.contents;

      // compare the derived names: `changes` stores names, not raw state
      const viewNames = getStageNames(view);
      if (!sameNames(viewNames, changes.view)) {
        newChanges.view = viewNames;
      }
      const extendedStageNames = getExtendedStageNames(extendedStages);
      if (!sameNames(extendedStageNames, changes.extendedStages)) {
        newChanges.extendedStages = extendedStageNames;
      }
      if (count !== changes.count) {
        newChanges.count = count;
      }
      const filterNames = getFilterNames(filters);
      if (!sameNames(filterNames, changes.filters)) {
        newChanges.filters = filterNames;
      }

      if (Object.keys(newChanges).length > 0) {
        setChanges((prevChanges) => ({ ...prevChanges, ...newChanges }));
      }
    },
    [changes],
  );

  useRecoilTransactionObserver_UNSTABLE(handleStateChange);
  const trackEvent = useTrackEvent();

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastTracked;
    if (Object.keys(changes).length > 0 && elapsed > debounceTime) {
      // skip uninteresting views
      const filterCount = changes.filters?.length || 0;
      const viewCount = changes.view?.length || 0;
      const extendedStagesCount = changes.extendedStages?.length || 0;
      const totalChanges = filterCount + viewCount + extendedStagesCount;
      if (totalChanges === 0) return;
      trackEvent("view_change", changes);
      setLastTracked(now);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track only when the recorded changes change; re-running on lastTracked/trackEvent would resend the same event
  }, [changes]);
};

function sameNames(a: string[], b?: string[]) {
  return !!b && a.length === b.length && a.every((name, i) => name === b[i]);
}

function getStageNames(stages: fos.State.Stage[]) {
  if (!stages) return [];
  if (!Array.isArray(stages)) {
    return Object.keys(stages);
  }
  return stages.map((stage: fos.State.Stage) => stage._cls);
}
function getExtendedStageNames(stages: { [key: string]: unknown }) {
  const names = [];
  for (const key in stages) {
    if (stages[key]) {
      names.push(key);
    }
  }
  return names;
}
function getFilterNames(filters: {
  [path: string]: { values?: unknown; range?: unknown };
}) {
  const names = [];
  filters = filters || {};
  for (const [, filter] of Object.entries(filters)) {
    if (filter.values) {
      names.push("values");
    }
    if (Array.isArray(filter.range)) {
      names.push("range");
    }
  }
  return names;
}

export default function EventTracker() {
  const info = useRecoilValue(analyticsInfo);
  if (!info?.doNotTrack) {
    return <ActualTracker />;
  }
  return null;
}

function ActualTracker() {
  useTrackViewChanges();

  return null;
}
