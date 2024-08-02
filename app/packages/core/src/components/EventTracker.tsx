import { useRecoilTransactionObserver_UNSTABLE, useRecoilValue } from "recoil";
import React, { useEffect, useState, useCallback } from "react";
import { viewAtom, extendedStagesAtom, countAtom } from "./atoms"; // Replace with actual atom imports
import * as fos from "@fiftyone/state";
import { analyticsInfo, useTrackEvent } from "@fiftyone/analytics";

const useTrackViewChanges = () => {
  const [changes, setChanges] = useState({});
  const [lastTracked, setLastTracked] = useState(0);
  const debounceTime = 500;

  const handleStateChange = useCallback(
    ({ snapshot }) => {
      const newChanges = {};
      const view = snapshot.getLoadable(fos.view)?.contents;
      const extendedStages = snapshot.getLoadable(fos.extendedStages)?.contents;
      const count = snapshot.getLoadable(
        fos.count({ path: "", extended: false, modal: false })
      )?.contents;
      const filters = snapshot.getLoadable(fos.filters)?.contents;

      if (view !== changes.view) {
        newChanges.view = getStageNames(view);
      }
      if (extendedStages !== changes.extendedStages) {
        newChanges.extendedStages = getExtendedStageNames(extendedStages);
      }
      if (count !== changes.count) {
        newChanges.count = count;
      }
      if (filters !== changes.filters) {
        newChanges.filters = getFilterNames(filters);
      }

      if (Object.keys(newChanges).length > 0) {
        setChanges((prevChanges) => ({ ...prevChanges, ...newChanges }));
      }
    },
    [changes]
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
  }, [changes]);
};

function getStageNames(stages: fos.State.Stage[]) {
  if (!stages) return [];
  if (!Array.isArray(stages)) {
    return Object.keys(stages);
  }
  return stages.map((stage: fos.State.Stage) => stage._cls);
}
function getExtendedStageNames(stages: { [key: string]: any }) {
  const names = [];
  for (const key in stages) {
    if (stages[key]) {
      names.push(key);
    }
  }
  return names;
}
function getFilterNames(filters: { [path: string]: any }) {
  const names = [];
  filters = filters || {};
  for (const [path, filter] of Object.entries(filters)) {
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
