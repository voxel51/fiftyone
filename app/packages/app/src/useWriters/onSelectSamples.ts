import { setSelected, setSelectedMutation } from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { RegisteredWriter } from "./registerWriter";

const onSelectSamples: RegisteredWriter<"selectedSamples"> =
  ({ environment, subscription }) =>
  (selected) => {
    commitMutation<setSelectedMutation>(environment, {
      mutation: setSelected,
      variables: {
        selected: selected instanceof DefaultValue ? [] : Array.from(selected),
        subscription,
      },
    });
  };

export default onSelectSamples;
