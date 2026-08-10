import {
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import { ChangeEvent, useCallback } from "react";
import { ViewTarget } from "../types";
import { useGetViewTargetCount, ViewTargetMeta } from "./state";

/**
 * Component which supports `radio`-style selection of a view target, with the
 * sample count each target would process.
 *
 * @param value Current view target
 * @param options View targets to offer, from {@link useViewTargets}
 * @param onChange Callback on selection change
 * @param label Accessible name announced for the radio group
 */
export const ViewTargetSelector = ({
  value,
  options,
  onChange,
  label = "Target view",
}: {
  value: ViewTarget;
  options: ViewTargetMeta[];
  onChange: (value: ViewTarget) => void;
  label?: string;
}) => {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value as ViewTarget),
    [onChange],
  );
  const getCount = useGetViewTargetCount();

  return (
    <FormControl>
      <RadioGroup
        row
        aria-label={label}
        sx={{ gap: 4 }}
        value={value}
        onChange={handleChange}
      >
        {options.map((opt) => (
          <FormControlLabel
            // flex-start to align the radio button with the first row of the label
            sx={{ alignItems: "flex-start" }}
            key={opt.target}
            value={opt.target}
            disabled={opt.unavailableReason !== undefined}
            label={
              <Stack direction="column" spacing={1}>
                <Typography>
                  {opt.label} ({getCount(opt.target).toLocaleString()})
                </Typography>
                <Typography color="secondary">
                  {opt.unavailableReason ?? opt.description}
                </Typography>
              </Stack>
            }
            // remove top padding for alignment
            control={<Radio sx={{ pt: 0 }} />}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
};

export default ViewTargetSelector;
