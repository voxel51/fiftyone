import React, { useCallback, useMemo } from "react";

import { useTheme } from "@mui/material/styles";
import { Box, TextField, Typography } from "@mui/material";

interface PropsType {
  value: string;
  onChange: (e: any) => void;
  direction?: "h" | "v";
  disabled?: boolean;
  autosave?: boolean;
}

export default function DatasetDescriptionInput(props: PropsType) {
  const theme = useTheme();
  const dir = props.direction || "v";
  const isVertical = dir === "v";
  const { autosave, disabled, value } = props;

  const isDisabled = !!disabled;

  const handleOnChange = useCallback(
    (e) => {
      props.onChange(e);
    },
    [autosave, props.onChange]
  );

  return (
    <Box
      display="flex"
      flexDirection={isVertical ? "column" : "row"}
      justifyContent={isVertical ? "space-between" : "center"}
      width="100%"
    >
      <Typography
        variant="body1"
        noWrap
        padding={1}
        pb={1}
        pl={0}
        sx={{ color: theme.palette.text.secondary }}
        width="100%"
        flex="1"
      >
        Description
      </Typography>
      <Box width="100%" flex="3">
        {isDisabled && (
          <Box display="flex" pt={1} pb={1}>
            <Typography
              variant="body1"
              sx={{ display: "flex", alignItems: "center" }}
            >
              {value || "No description"}
            </Typography>
          </Box>
        )}
        {!isDisabled && (
          <TextField
            data-testid="dataset-description-input"
            multiline
            rows={6}
            maxRows={6}
            fullWidth
            aria-label="dataset-description"
            placeholder="Enter a description..."
            onChange={handleOnChange}
            defaultValue=""
            value={value}
          ></TextField>
        )}
      </Box>
    </Box>
  );
}
