import React from "react";
import {
  Box,
  CircularProgress,
  LinearProgress,
  Typography,
} from "@mui/material";
import { getComponentProps } from "../utils";

export default function ProgressView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const { label, variant = "linear" } = view;

  const percent = parseFloat(schema?.default ?? data);
  const progress = percent * 100;
  const progressVariant = isNaN(progress) ? "indeterminate" : "determinate";

  return (
    <Box
      sx={{ position: "relative" }}
      {...getComponentProps(props, "container")}
    >
      <Box
        sx={{ display: "flex", gap: 2, alignItems: "center" }}
        {...getComponentProps(props, "progressContainer")}
      >
        <Box width="100%" {...getComponentProps(props, "progress")}>
          {variant === "linear" && (
            <LinearProgress value={progress} variant={progressVariant} />
          )}
          {variant === "circular" && (
            <CircularProgress value={progress} variant={progressVariant} />
          )}
        </Box>
        {!isNaN(progress) && (
          <Typography
            color="text.secondary"
            sx={
              variant === "circular"
                ? { position: "absolute", left: 6, top: 10, fontSize: 12 }
                : {}
            }
            {...getComponentProps(props, "progressLabel")}
          >
            {Math.round(progress)}%
          </Typography>
        )}
      </Box>
      {label && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={variant === "circular" ? {} : { textAlign: "center" }}
          {...getComponentProps(props, "label")}
        >
          {label}
        </Typography>
      )}
    </Box>
  );
}
