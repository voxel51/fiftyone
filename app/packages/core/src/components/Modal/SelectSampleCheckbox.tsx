import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Checkbox } from "@mui/material";
import React from "react";
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
