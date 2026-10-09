/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { setView, subscribe, type setViewMutation } from "@fiftyone/relay";
import {
  DEFAULT_SELECTION_STYLE,
  datasetName,
  resetFiltersTransaction,
  stateSubscription,
} from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { resolveURL } from "../utils";
import type { RegisteredSetter } from "./registerSetter";

const onSetViewName: RegisteredSetter =
  ({ environment, router, sessionRef }) =>
  ({ get, set }, value: string | DefaultValue | null) => {
    set(pendingEntry, true);
    const slug = value instanceof DefaultValue ? null : value;

    const dataset = get(datasetName);
    if (!dataset) {
      throw new Error("no dataset");
    }

    // A saved view is a new view: the sidebar filters clear when it
    // publishes, as for any view change (see onSetView)
    const unsubscribe = subscribe((_, transaction) => {
      try {
        resetFiltersTransaction(transaction);
      } finally {
        unsubscribe();
      }
    });

    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables: {
        subscription: get(stateSubscription),
        view: [],
        savedViewSlug: slug,
        datasetName: dataset,
        form: {},
      },
    });

    sessionRef.current.selectedLabels = [];
    sessionRef.current.selectedSamples = new Map();
    sessionRef.current.sampleSelectionStyle = DEFAULT_SELECTION_STYLE;
    sessionRef.current.fieldVisibilityStage = undefined;
    // The silent schema-policy exclusion (`$extendedView`) must survive
    // a saved-view change; only Field Visibility resets.
    const { schemaExclusion } = router.get().state;
    router.history.push(
      resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        nextDataset: dataset,
        nextView: slug || undefined,
      }),
      {
        view: [],
        schemaExclusion,
      },
    );
  };

export default onSetViewName;
