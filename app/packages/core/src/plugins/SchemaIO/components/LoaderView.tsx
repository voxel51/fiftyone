import { executeOperator } from "@fiftyone/operators";
import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { get } from "lodash";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { getComponentProps } from "../utils";
import DynamicIO from "./DynamicIO";

type LoaderState = "idle" | "loading" | "loaded" | "errored";

type LoaderValue = {
  state: LoaderState;
  data?: unknown;
  error?: string;
};

export default function LoaderView(props: LoaderViewProps) {
  const { path, schema, onChange, fullData } = props;
  const { view = {} } = schema;
  const {
    operator,
    params = {},
    label = "Loading...",
    placeholder_view: placeholderView,
  } = view;

  const currentValue: LoaderValue = get(fullData, path) || { state: "idle" };
  const { state, error } = currentValue;

  const lastParamsRef = useRef<string>();
  const serializedParams = useMemo(() => JSON.stringify(params), [params]);

  const executeLoad = useCallback(() => {
    if (!operator) return;

    onChange(path, { state: "loading" });
    lastParamsRef.current = serializedParams;

    executeOperator(operator, params, {
      callback: (result) => {
        if (result.error) {
          onChange(path, {
            state: "errored",
            error: result.errorMessage || String(result.error),
          });
        } else {
          onChange(path, {
            state: "loaded",
            data: result.result,
          });
        }
      },
    });
  }, [operator, params, path, onChange, serializedParams]);

  useEffect(() => {
    const paramsChanged = lastParamsRef.current !== serializedParams;
    const shouldLoad =
      state === "idle" || (paramsChanged && state !== "loading");

    if (shouldLoad) {
      executeLoad();
    }
  }, [serializedParams, state, executeLoad]);

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
          <CircularProgress
            size={16}
            sx={{ position: "absolute", top: 12, right: 12 }}
          />
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
          {label}
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

type LoaderViewProps = {
  path: string;
  schema: {
    view?: {
      operator?: string;
      params?: Record<string, unknown>;
      label?: string;
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
