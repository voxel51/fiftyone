/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { subscribe } from "@fiftyone/relay";
import {
  hiddenLabels,
  savedLookerOptions,
  similaritySorting,
} from "@fiftyone/state";
import type { RegisteredSetter } from "./registerSetter";

const onSetSimilarityParameters: RegisteredSetter =
  ({ router }) =>
  () => {
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
