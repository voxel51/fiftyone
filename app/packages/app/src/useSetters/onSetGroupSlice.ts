import { setGroupSlice, setGroupSliceMutation } from "@fiftyone/relay";
import { stateSubscription } from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";
import { RegisteredSetter } from "./registerSetter";

const onSetGroupSlice: RegisteredSetter =
  ({ environment, sessionRef }) =>
  ({ get }, slice: string) => {
    sessionRef.current.selectedLabels = [];
    sessionRef.current.selectedSamples = new Set();
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
