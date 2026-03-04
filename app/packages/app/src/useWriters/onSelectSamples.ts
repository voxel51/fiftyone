import { getSessionRef } from "@fiftyone/state";
import { setSelected, type setSelectedMutation } from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSelectSamples: RegisteredWriter<"selectedSamples"> =
  ({ environment, subscription }) =>
  (selected) => {
    const selectedSet =
      selected instanceof DefaultValue ? new Set<string>() : selected;
    const sessionRef = getSessionRef();
    const rawMeta = sessionRef?.selectedMeta;

    // Filter meta to only include IDs still in the selected set
    const selectedMeta = rawMeta
      ? Object.fromEntries(
          Object.entries(rawMeta).filter(([id]) => selectedSet.has(id))
        )
      : {};

    commitMutation<setSelectedMutation>(environment, {
      mutation: setSelected,
      variables: {
        selected: Array.from(selectedSet),
        selectedMeta,
        subscription,
      },
    });
  };

export default onSelectSamples;
