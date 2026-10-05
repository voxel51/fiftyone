/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { setView, type setViewMutation } from "@fiftyone/relay";
import {
  DEFAULT_SELECTION_STYLE,
  datasetName,
  view,
  stateSubscription,
} from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { resolveURL } from "../utils";
import { convertsSampleIdentity } from "./selectionIdentity";
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

    // Saved stages are not known until the response arrives. Their IDs may
    // belong to a converted view, so only a plain-view reset can retain them.
    if (slug || convertsSampleIdentity(get(view)))
      sessionRef.current.selectedSamples = new Map();
    sessionRef.current.selectedLabels = [];
    sessionRef.current.sampleSelectionStyle = DEFAULT_SELECTION_STYLE;
    sessionRef.current.fieldVisibilityStage = undefined;
    router.history.push(
      resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.location.search,
        nextDataset: dataset,
        nextView: slug || undefined,
      }),
      {
        view: [],
      },
    );
  };

export default onSetViewName;
