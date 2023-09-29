import { subscribe } from "@fiftyone/relay";
import {
  hiddenLabels,
  savedLookerOptions,
  similaritySorting,
} from "@fiftyone/state";
import { RegisteredSetter } from "./registerSetter";

const onSetSimilarityParameters: RegisteredSetter =
  ({ router, sessionRef }) =>
  () => {
    sessionRef.current.selectedLabels = [];
    sessionRef.current.selectedSamples = new Set();
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
