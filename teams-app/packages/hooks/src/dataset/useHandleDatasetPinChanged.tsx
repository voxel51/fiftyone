import { useMemo } from "react";
import {
  Dataset,
  lastPinToggledDatasetState,
  setDatasetPinnedMutation,
} from "@fiftyone/teams-state";
import { useSetRecoilState } from "recoil";
import { useMutation } from "@fiftyone/hooks";

interface Props {
  slug: string;
  currentlyPinned: boolean;
  row: Dataset;
}

export const useHandleDatasetPinChanged = (props: Props) => {
  const { slug, currentlyPinned, row } = props;
  const [setDatasetPinned] = useMutation(setDatasetPinnedMutation);
  const toggleType = currentlyPinned ? "unpin" : "pin";

  const setLastPinToggledDataset = useSetRecoilState(
    lastPinToggledDatasetState
  );

  return useMemo(() => {
    return {
      toggleDatasetPin: () => {
        setDatasetPinned({
          successMessage: `Successfully ${toggleType}ned dataset`,
          errorMessage: `Failed to ${toggleType} the dataset.`,
          variables: { datasetIdentifier: slug, pinned: !currentlyPinned },
          onCompleted: () => {
            setLastPinToggledDataset(row);
          },
          onError: (e) => {
            console.error("pinning failed", e);
          },
        });
      },
    };
  }, [props]);
};
