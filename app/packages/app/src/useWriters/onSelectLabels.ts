import {
  setSelectedLabels,
  type setSelectedLabelsMutation,
} from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSelectLabels: RegisteredWriter<"selectedLabels"> =
  ({ environment, subscription }) =>
  (selectedLabels) => {
    commitMutation<setSelectedLabelsMutation>(environment, {
      mutation: setSelectedLabels,
      variables: {
        selectedLabels:
          selectedLabels instanceof DefaultValue ? [] : selectedLabels,
        subscription,
      },
    });
  };

export default onSelectLabels;
