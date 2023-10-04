import { setView, setViewMutation } from "@fiftyone/relay";
import {
  State,
  datasetName,
  stateSubscription,
  viewStateForm_INTERNAL,
} from "@fiftyone/state";
import { GQLError, GraphQLError } from "@fiftyone/utilities";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { RegisteredSetter } from "./registerSetter";

const onSetView: RegisteredSetter =
  ({ environment, handleError, router, sessionRef }) =>
  ({ get, set }, view: State.Stage[]) => {
    set(pendingEntry, true);
    if (view instanceof DefaultValue) {
      view = [];
    }
    const variables = {
      view,
      datasetName: get(datasetName) as string,
      subscription: get(stateSubscription),
      form: get(viewStateForm_INTERNAL) || {},
    };
    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables,
      onCompleted: ({ setView: view }, errors) => {
        if (errors?.length) {
          handleError(
            new GraphQLError({ errors: errors as GQLError[], variables })
          );
          return;
        }
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
