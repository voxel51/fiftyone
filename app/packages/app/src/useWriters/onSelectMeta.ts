import { getSessionRef } from "@fiftyone/state";
import { setSelected, type setSelectedMutation } from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSelectMeta: RegisteredWriter<"selectedMeta"> =
  ({ environment, subscription }) =>
  (selectedMeta) => {
    const sessionRef = getSessionRef();
    const selectedSet = sessionRef?.selectedSamples || new Set<string>();
    const meta =
      selectedMeta instanceof DefaultValue ? undefined : selectedMeta;

    // Filter meta to only include IDs still in the selected set
    const filteredMeta = meta
      ? Object.fromEntries(
          Object.entries(meta).filter(([id]) => selectedSet.has(id))
        )
      : undefined;

    commitMutation<setSelectedMutation>(environment, {
      mutation: setSelected,
      variables: {
        selected: Array.from(selectedSet),
        selectedMeta: filteredMeta,
        subscription,
      },
    });
  };

export default onSelectMeta;
