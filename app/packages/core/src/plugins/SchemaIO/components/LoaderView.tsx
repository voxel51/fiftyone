/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { get } from "lodash";
import React, { useEffect } from "react";
import { getComponentProps } from "../utils";
import DynamicIO from "./DynamicIO";
import {
  useDependencyHash,
  useLoadTrigger,
  useExecuteLoader,
  type LoaderState,
  type LoaderValue,
} from "./hooks";

export default function LoaderView(props: LoaderViewProps) {
  const { path, schema, onChange, fullData } = props;
  const { view = {} } = schema;
  const {
    operator,
    params = {},
    label = "Loading...",
    placeholder_view: placeholderView,
    dependencies,
    message,
  } = view;

  const currentValue: LoaderValue = get(fullData, path) || { state: "idle" };
  const { state, error } = currentValue;

  const dependencyHash = useDependencyHash(params, dependencies);
  const { shouldLoad, markLoaded } = useLoadTrigger(
    state as LoaderState,
    dependencyHash
  );
  const executeLoad = useExecuteLoader({ operator, params, path, onChange });

  useEffect(() => {
    if (shouldLoad) {
      markLoaded();
      executeLoad();
    }
  }, [shouldLoad, markLoaded, executeLoad]);

  // Render loading state
  if (state === "loading" || state === "idle") {
    if (placeholderView) {
      return (
        <Box
          sx={{ position: "relative", opacity: 0.7, pointerEvents: "none" }}
          {...getComponentProps(props, "container")}
        >
          <DynamicIO
            {...props}
            schema={{
              ...placeholderView,
              view: { ...placeholderView.view, readOnly: true },
            }}
          />
          <Box
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <CircularProgress size={16} />
            {message && (
              <Typography variant="body2" color="text.secondary">
                {message}
              </Typography>
            )}
          </Box>
        </Box>
      );
    }
    return (
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}
        {...getComponentProps(props, "container")}
      >
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          {message || label}
        </Typography>
      </Box>
    );
  }

  if (state === "errored") {
    return (
      <Alert severity="error" sx={{ py: 0.5 }}>
        {error || "Failed to load data"}
      </Alert>
    );
  }

  return null;
}

export type LoaderViewProps = {
  path: string;
  schema: {
    view?: {
      operator?: string;
      params?: Record<string, unknown>;
      label?: string;
      message?: string;
      dependencies?: string[];
      placeholder_view?: {
        view?: Record<string, unknown>;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  onChange: (path: string, value: LoaderValue) => void;
  fullData: Record<string, unknown>;
};
