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

    // Serialize Map to [{sample_id, type}, ...] for the mutation
    const selectedSamplesPayload = Array.from(selectedMap.entries()).map(
      ([sampleId, type]) => ({
        sample_id: sampleId,
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
