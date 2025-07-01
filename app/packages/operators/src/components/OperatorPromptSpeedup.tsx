import React from "react";
import { Box, Input, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import SpeedIcon from "@mui/icons-material/Speed";

// "NEW" badge, styled to match the app's theme
const NewBadge = styled("span")(({ theme }) => ({
  color: "rgb(255,141,76)",
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "1rem",
  fontWeight: "bold",
  marginLeft: theme.spacing(1),
}));

// A styled numeric input that matches the look in the images
const StyledInput = styled(Input)(({ theme }) => ({
  width: "60px",
  height: "40px",
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: "4px",
  padding: "0 8px",
  "& input[type=number]": {
    textAlign: "center",
    "-moz-appearance": "textfield",
  },
  "& input[type=number]::-webkit-outer-spin-button": {
    "-webkit-appearance": "none",
    margin: 0,
  },
  "& input[type=number]::-webkit-inner-spin-button": {
    "-webkit-appearance": "none",
    margin: 0,
  },
}));

interface SpeedupProps {
  value: number; // The current number of batches
  onChange: (value: number) => void;
  maxWorkers: number; // The maximum number of available workers
}

export const Speedup: React.FC<SpeedupProps> = ({
  value,
  onChange,
  maxWorkers,
}) => {
  // Memoize derived state for performance and clarity
  const { speedupText, speedupColor, showDescription } = React.useMemo(() => {
    // Sanitize value to be an integer
    const numBatches = Math.floor(value);

    if (numBatches <= 1) {
      return {
        speedupText: "Standard speed",
        speedupColor: "text.secondary", // Gray color for standard speed
        showDescription: false,
      };
    }

    const speedupFactor = Math.min(numBatches, maxWorkers);
    return {
      speedupText: `up to ${speedupFactor}x faster`,
      speedupColor: "rgb(174,131,247)", // Purple color for speedup
      showDescription: numBatches > maxWorkers,
    };
  }, [value, maxWorkers]);

  const handleBatchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseInt(event.target.value, 10);
    // Allow 0, but prevent negative numbers. Set to 0 if input is cleared (NaN).
    onChange(isNaN(num) || num < 0 ? 0 : num);
  };

  return (
    <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Title Row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <SpeedIcon style={{ color: "rgb(174,131,247)" }} />
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Speed-up processing
        </Typography>
        <NewBadge>NEW</NewBadge>
      </Box>

      <Typography variant="body2" color="text.secondary">
        Applicable for scheduled runs only
      </Typography>

      {/* Input Row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mt: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <StyledInput
            type="number"
            value={value}
            onChange={handleBatchChange}
            inputProps={{ min: 0, "data-cy": "batches-input" }}
            disableUnderline
          />
          <Typography>batches</Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{ fontWeight: "bold", color: speedupColor }}
        >
          {speedupText}
        </Typography>
      </Box>

      {/* Conditional Description */}
      {showDescription && (
        <Typography variant="body2" color="text.secondary">
          You have up to {maxWorkers} workers to process batches in parallel.
          Additional batches will result in shorter run times per batch, but no
          additional speed-up.
        </Typography>
      )}
    </Box>
  );
};
