import { Dialog } from "@fiftyone/components";
import { Settings } from "@mui/icons-material";
import {
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React from "react";
import { CONFUSION_MATRIX_SORT_OPTIONS } from "../constants";

export default function ConfusionMatrixConfig(props) {
  const { config, onSave, classes = [] } = props;
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState(config);
  const hasChosenClasses = state.classes && state.classes.length > 0;

  const { sortBy = "default", limit, log } = state;
  const showClassesFilter = classes.length > 0;

  return (
    <Stack>
      <IconButton
        onClick={() => {
          setOpen(true);
        }}
      >
        <Settings />
      </IconButton>
      <Dialog open={Boolean(open)} fullWidth onClose={() => setOpen(false)}>
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Settings color="secondary" />
            <Typography sx={{ fontSize: 18 }}>
              Display Options: Confusion Matrix
            </Typography>
          </Stack>
          {showClassesFilter && (
            <Stack spacing={1}>
              <Typography>Choose classes</Typography>
              <Typography color="secondary">
                List of specific classes to display in the confusion matrix
              </Typography>
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={classes}
                defaultValue={state.classes}
                onChange={(e, value) => {
                  setState((state) => ({
                    ...state,
                    classes: value,
                  }));
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    placeholder="Select classes"
                    variant="outlined"
                  />
                )}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return (
                      <Chip
                        size="small"
                        key={key}
                        label={option}
                        {...tagProps}
                      />
                    );
                  })
                }
              />
            </Stack>
          )}
          <Stack direction={"row"} spacing={2} pt={1}>
            <Stack spacing={1} width="100%">
              <Typography>Order</Typography>
              <Typography color="secondary">Sort results by</Typography>
              <Select
                size="small"
                onChange={(e) => {
                  setState((state) => ({
                    ...state,
                    sortBy: e.target.value as string,
                  }));
                }}
                defaultValue={sortBy}
              >
                {CONFUSION_MATRIX_SORT_OPTIONS.map((option) => {
                  return (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  );
                })}
              </Select>
            </Stack>
            <Stack spacing={1} width="100%">
              <Typography>Limit</Typography>
              <Typography color="secondary">
                Limit the number of classes to display
              </Typography>
              <TextField
                defaultValue={limit}
                size="small"
                type="number"
                onChange={(e) => {
                  const newLimit = parseInt(e.target.value);
                  setState((state) => {
                    return {
                      ...state,
                      limit: isNaN(newLimit) ? undefined : newLimit,
                    };
                  });
                }}
                disabled={hasChosenClasses}
                title={
                  hasChosenClasses
                    ? "Limit is disabled when classes are selected"
                    : undefined
                }
              />
            </Stack>
          </Stack>
          <FormControlLabel
            label="Use logarithmic colorscale"
            control={
              <Checkbox
                defaultChecked={log}
                onChange={(e, checked) => {
                  setState((state) => ({ ...state, log: checked }));
                }}
              />
            }
          />
          <Stack direction="row" spacing={1} pt={2}>
            <Button
              variant="outlined"
              color="secondary"
              sx={{ width: "100%" }}
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              sx={{ width: "100%" }}
              onClick={() => {
                onSave(state);
                setOpen(false);
              }}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </Dialog>
    </Stack>
  );
}
