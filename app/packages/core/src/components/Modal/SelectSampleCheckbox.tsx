import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Checkbox } from "@mui/material";
import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";

interface SelectSampleCheckboxProps {
  sampleId: string;
}

export const SelectSampleCheckbox = ({
  sampleId,
}: SelectSampleCheckboxProps) => {
  const theme = useTheme();
  const selected = useRecoilValue(fos.selectedSamples).has(sampleId);
  const select = fos.useSelectSample();

  const isVideoDataset = useRecoilValue(fos.isVideoDataset);

  // select sample on space key press
  const spaceKeyHandler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === " " && !isVideoDataset) {
        select(sampleId);
      }
    },
    [sampleId, select, isVideoDataset]
  );

  fos.useEventHandler(document, "keyup", spaceKeyHandler);

  return (
    <Checkbox
      title={selected ? "Select sample" : "Selected"}
      checked={selected}
      style={{ color: theme.primary.plainColor }}
      onClick={() => select(sampleId)}
      data-cy="select-sample-checkbox"
    />
  );
};
