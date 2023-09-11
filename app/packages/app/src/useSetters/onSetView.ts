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
import { RegisteredSetter } from "./registerSetter";

const onSetView: RegisteredSetter =
  ({ environment, router, sessionRef }) =>
  ({ get, set }, view: State.Stage[]) => {
    set(pendingEntry, true);
    if (view instanceof DefaultValue) {
      view = [];
    }
    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables: {
        view,
        datasetName: get(datasetName) as string,
        subscription: get(stateSubscription),
        form: get(viewStateForm_INTERNAL) || {},
      },
      onCompleted: ({ setView: view }) => {
        sessionRef.current.selectedLabels = [];
        sessionRef.current.selectedSamples = new Set();
        sessionRef.current.selectedFields = undefined;
        router.history.push(`${router.get().pathname}`, {
          view,
        });
      },
    });
  };

export default onSetView;
