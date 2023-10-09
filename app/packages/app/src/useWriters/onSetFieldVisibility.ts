import {
  setFieldVisibility,
  setFieldVisibilityMutation,
} from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import { RegisteredWriter } from "./registerWriter";

const onSetFieldVisibility: RegisteredWriter<"fieldVisibility"> =
  ({ environment, subscription }) =>
  (input) => {
    console.log("input", input);
    commitMutation<setFieldVisibilityMutation>(environment, {
      mutation: setFieldVisibility,
      variables: {
        input,
        subscription,
      },
    });
  };

export default onSetFieldVisibility;
