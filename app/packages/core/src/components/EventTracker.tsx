import { useRecoilTransactionObserver_UNSTABLE } from "recoil";
import React, { useEffect, useState, useCallback } from "react";
import { viewAtom, extendedStagesAtom, countAtom } from "./atoms"; // Replace with actual atom imports
import * as fos from "@fiftyone/state";

function trackEvent(eventName, properties) {
  if (window && window.analytics) {
    window.analytics.track(eventName, properties);
  }
}

const useTrackViewChanges = () => {
  const [changes, setChanges] = useState({});
  const [lastTracked, setLastTracked] = useState(0);
  const debounceTime = 500;

  const handleStateChange = useCallback(
    ({ snapshot }) => {
      const newChanges = {};
      const view = snapshot.getLoadable(fos.view).contents;
      const extendedStages = snapshot.getLoadable(fos.extendedStages).contents;
      const count = snapshot.getLoadable(fos.count).contents;

      if (view !== changes.view) {
        newChanges.view = getStageNames(view);
      }
      if (extendedStages !== changes.extendedStages) {
        newChanges.extendedStages = getStageNames(extendedStages);
      }
      if (count !== changes.count) {
        newChanges.count = count;
      }

      if (Object.keys(newChanges).length > 0) {
        setChanges((prevChanges) => ({ ...prevChanges, ...newChanges }));
      }
    },
    [changes]
  );

  useRecoilTransactionObserver_UNSTABLE(handleStateChange);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastTracked;
    if (Object.keys(changes).length > 0 && elapsed > debounceTime) {
      trackEvent("view_change", changes);
      setLastTracked(now);
    }
  }, [changes]);
};

function getStageNames(stages: fos.State.Stage[]) {
  if (!stages) return [];
  return stages.map((stage: fos.State.Stage) => stage._cls);
}

export default function EventTracker() {
  if (window && window.analytics) {
    return <ActualTracker />;
  }
  return null;
}

function ActualTracker() {
  useTrackViewChanges();

  return null;
}
