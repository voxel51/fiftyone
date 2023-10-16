import {
  setFieldVisibilityStage,
  setFieldVisibilityStageMutation,
} from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import { RegisteredWriter } from "./registerWriter";

const onSetFieldVisibilityStage: RegisteredWriter<"fieldVisibilityStage"> =
  ({ environment, subscription }) =>
  (input) => {
    console.log("onSetFieldVisibilityStage:input", input);
    if (!input) return;

    commitMutation<setFieldVisibilityStageMutation>(environment, {
      mutation: setFieldVisibilityStage,
      variables: {
        input: {
          cls: input?.cls,
          kwargs: {
            fieldNames: input?.kwargs.field_names,
            allowMissing: true,
          },
        },
        subscription,
      },
    });
  };

export default onSetFieldVisibilityStage;
