import { setGroupSlice, setGroupSliceMutation } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import { RegisteredWriter } from "./registerWriter";

const onSetGroupSlice: RegisteredWriter<"sessionGroupSlice"> =
  ({ environment, subscription }) =>
  (slice) => {
    if (!slice) {
      throw new Error("slice not defined");
    }

    commitMutation<setGroupSliceMutation>(environment, {
      mutation: setGroupSlice,
      variables: {
        slice: slice,
        subscription,
      },
    });
  };

export default onSetGroupSlice;
