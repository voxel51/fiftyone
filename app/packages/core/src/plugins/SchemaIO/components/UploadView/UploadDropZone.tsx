import React from "react";
import { Box, Typography } from "@mui/material";
import { CloudUpload } from "@mui/icons-material";

interface UploadDropZoneProps {
  dropProps: Record<string, unknown> & { isDragActive?: boolean };
  inputProps: Record<string, unknown>;
  browse: () => void;
  disabled?: boolean;
}

export default function UploadDropZone({
  dropProps,
  inputProps,
  browse,
  disabled,
}: UploadDropZoneProps) {
  const { isDragActive, ...domDropProps } = dropProps;

  return (
    <Box
      {...domDropProps}
      onClick={disabled ? undefined : browse}
      sx={{
        p: 3,
        border: (theme) => `1px dashed ${theme.palette.divider}`,
        borderRadius: 1,
        textAlign: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color 0.2s, background-color 0.2s",
        "&:hover": disabled
          ? {}
          : {
              background: (theme) => theme.palette.background.level3,
            },
        ...(isDragActive && {
          borderColor: "primary.main",
          background: (theme) => theme.palette.background.level3,
        }),
      }}
    >
      <input {...inputProps} />
      <CloudUpload sx={{ fontSize: 32, mb: 0.5, color: "text.secondary" }} />
      <Box>
        <Typography
          component="span"
          sx={{ fontWeight: 600, textDecoration: "underline" }}
        >
          Click to upload
        </Typography>
        <Typography component="span" color="text.secondary">
          {" "}
          or drag and drop
        </Typography>
      </Box>
    </Box>
  );
}
