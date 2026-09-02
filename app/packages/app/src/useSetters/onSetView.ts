/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { rollbackViewBar } from "@fiftyone/core";
import { setView, subscribe, type setViewMutation } from "@fiftyone/relay";
import {
  type State,
  datasetName,
  resetExtendedSelectionTransaction,
  stateSubscription,
  viewStateForm_INTERNAL,
} from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { resolveURL } from "../utils";
import type { RegisteredSetter } from "./registerSetter";

const onSetView: RegisteredSetter =
  ({ environment, handleError, router, sessionRef }) =>
  ({ get, set }, value: State.Stage[]) => {
    set(pendingEntry, true);
    // A new view replaces the base the selection was made against, so it goes
    // with the checkmarks `onCompleted` drops below. Sidebar filters never
    // reach this setter, so a lasso still composes with them.
    //
    // Deferred to the publish rather than done here: a rejected view rolls
    // back without ever publishing, and dropping the stage up front would
    // both lose the selection and send the grid to load a wider result set
    // for a view that never arrives.
    const unsubscribe = subscribe((_, transaction) => {
      resetExtendedSelectionTransaction(transaction);
      unsubscribe();
    });
    let view = value;
    if (view instanceof DefaultValue) {
      view = [];
    }
    const dataset = get(datasetName);
    if (!dataset) {
      throw new Error("no dataset");
    }

    const variables = {
      view,
      datasetName: dataset,
      subscription: get(stateSubscription),
      form: get(viewStateForm_INTERNAL) || {},
    };
    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables,
      onCompleted: ({ setView: view }, errors) => {
        if (errors?.length) {
          // Nothing publishes on this path, so the pending reset would
          // otherwise sit registered and fire on the next navigation
          unsubscribe();
          handleError(errors.map((e) => e.message));
          rollbackViewBar();
          return;
        }

        sessionRef.current.selectedLabels = [];
        sessionRef.current.selectedSamples = new Map();
        sessionRef.current.fieldVisibilityStage = undefined;
        router.history.push(
          resolveURL({
            currentPathname: router.history.location.pathname,
            currentSearch: router.history.location.search,
            nextDataset: dataset,
          }),
          {
            view,
          },
        );
      },
      onError: (error) => {
        // A network failure never reaches onCompleted, so the pending reset
        // has to be dropped here as well
        unsubscribe();
        handleError([error.message]);
        rollbackViewBar();
      },
    });
  };

export default onSetView;
