import {
  setSelectedSamples,
  type setSelectedSamplesMutation,
} from "@fiftyone/relay";
import type { SelectionType } from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSelectSamples: RegisteredWriter<"selectedSamples"> =
  ({ environment, subscription }) =>
  (selected) => {
    const selectedMap =
      selected instanceof DefaultValue
        ? new Map<string, SelectionType>()
        : selected;

    // Serialize Map to [{id, type}, ...] for the mutation
    const selectedSamplesPayload = Array.from(selectedMap.entries()).map(
      ([id, type]) => ({
        id,
        type,
      })
    );

    commitMutation<setSelectedSamplesMutation>(environment, {
      mutation: setSelectedSamples,
      variables: {
        selectedSamples: selectedSamplesPayload,
        subscription,
      },
    });
  };

export default onSelectSamples;
