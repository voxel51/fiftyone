import { getSessionRef } from "@fiftyone/state";
import { setSelected, type setSelectedMutation } from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSelectMeta: RegisteredWriter<"selectedMeta"> =
  ({ environment, subscription }) =>
  (selectedMeta) => {
    const sessionRef = getSessionRef();
    const selected = sessionRef?.selectedSamples;
    commitMutation<setSelectedMutation>(environment, {
      mutation: setSelected,
      variables: {
        selected:
          selected instanceof DefaultValue ? [] : Array.from(selected || []),
        selectedMeta:
          selectedMeta instanceof DefaultValue ? undefined : selectedMeta,
        subscription,
      },
    });
  };

export default onSelectMeta;
