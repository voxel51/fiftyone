import {
  Box,
  Button,
  FormControl,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { Fragment } from "react";

export type FooterVariant = "reset" | "preview-cta" | "import-cta";

export const LensFooter = ({
  variant,
  loading,
  maxSamples,
  isPreviewEnabled,
  onMaxSamplesChange,
  onResetClick,
  onPreviewClick,
  onImportClick,
}: {
  variant: FooterVariant;
  loading: boolean;
  maxSamples: number;
  isPreviewEnabled: boolean;
  onMaxSamplesChange: (value?: string) => void;
  onResetClick: () => void;
  onPreviewClick: () => void;
  onImportClick: () => void;
}) => {
  const numSamplesInput = (
    <FormControl>
      <TextField
        label="Number of preview samples"
        value={isNaN(maxSamples) ? "" : maxSamples}
        onChange={(e) => onMaxSamplesChange(e.target.value)}
      />
    </FormControl>
  );

  let content: React.ReactNode;

  switch (variant) {
    case "reset": {
      content = (
        <Button
          fullWidth
          variant="contained"
          onClick={onResetClick}
          disabled={loading}
        >
          Start a new query
        </Button>
      );

      break;
    }

    case "preview-cta": {
      content = (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography color="secondary">
            Try a preview &rarr; import unlimited samples
          </Typography>

          <Stack direction="row" spacing={2} alignItems="center">
            {numSamplesInput}

            <Button
              variant="contained"
              sx={{ height: "fit-content" }}
              disabled={!isPreviewEnabled}
              onClick={onPreviewClick}
            >
              Preview data
            </Button>
          </Stack>
        </Box>
      );

      break;
    }

    case "import-cta": {
      content = (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            {numSamplesInput}

            <Button
              variant="outlined"
              color="secondary"
              sx={{ height: "fit-content" }}
              disabled={!isPreviewEnabled}
              onClick={onPreviewClick}
            >
              Preview data
            </Button>
          </Stack>

          <Button variant="contained" onClick={onImportClick}>
            Import data
          </Button>
        </Box>
      );

      break;
    }

    default: {
      content = <Fragment />;
      break;
    }
  }

  return <Box sx={{ m: 2 }}>{content}</Box>;
};
