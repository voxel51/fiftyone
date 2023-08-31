import {
  setGroupSlice,
  setGroupSliceMutation,
  subscribe,
} from "@fiftyone/relay";
import { stateSubscription } from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";
import { RegisteredSetter } from "./registerSetter";

const onSetGroupSlice: RegisteredSetter =
  (environment, _, sessionRef) =>
  ({ get }, slice: string) => {
    const unsubscribe = subscribe(() => {
      sessionRef.current.selectedLabels = [];
      sessionRef.current.selectedSamples = new Set();
      unsubscribe();
    });
    !env().VITE_NO_STATE &&
      commitMutation<setGroupSliceMutation>(environment, {
        mutation: setGroupSlice,
        variables: {
          slice,
          subscription: get(stateSubscription),
        },
      });
  };

export default onSetGroupSlice;
