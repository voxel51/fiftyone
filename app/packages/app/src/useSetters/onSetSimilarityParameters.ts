import { subscribe } from "@fiftyone/relay";
import {
  DEFAULT_SELECTION_STYLE,
  hiddenLabels,
  savedLookerOptions,
  similaritySorting,
} from "@fiftyone/state";
import type { RegisteredSetter } from "./registerSetter";

const onSetSimilarityParameters: RegisteredSetter =
  ({ router, sessionRef }) =>
  () => {
    sessionRef.current.selectedLabels = [];
    sessionRef.current.selectedSamples = new Map();
    sessionRef.current.sampleSelectionStyle = DEFAULT_SELECTION_STYLE;
    const unsubscribe = subscribe((_, { set }) => {
      set(similaritySorting, false);
      set(savedLookerOptions, (cur) => ({
        ...cur,
        showJSON: false,
      }));
      set(hiddenLabels, {});
      unsubscribe();
    });

    router.load(true);
  };

export default onSetSimilarityParameters;
