import { rollbackViewBar } from "@fiftyone/core";
import { setView, setViewMutation } from "@fiftyone/relay";
import {
  State,
  datasetName,
  stateSubscription,
  viewStateForm_INTERNAL,
} from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { resolveURL } from "../utils";
import { RegisteredSetter } from "./registerSetter";

const onSetView: RegisteredSetter =
  ({ environment, handleError, router, sessionRef }) =>
  ({ get, set }, view: State.Stage[]) => {
    set(pendingEntry, true);
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
          handleError(errors.map((e) => e.message));
          rollbackViewBar();
          return;
        }

        sessionRef.current.selectedLabels = [];
        sessionRef.current.selectedSamples = new Set();
        sessionRef.current.selectedFields = undefined;
        router.history.push(resolveURL(router, dataset), {
          view,
        });
      },
    });
  };

export default onSetView;
