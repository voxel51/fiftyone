import { useTrackEvent } from "@fiftyone/analytics";
import { Toast, useTheme } from "@fiftyone/components";
import { OPTIMIZING_QUERY_PERFORMANCE, SUMMARY_FIELDS } from "../utils/links";
import { useEventBus } from "@fiftyone/events";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { Bolt } from "@mui/icons-material";
import { Box, Button, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { atom, useRecoilState } from "recoil";

const SHOWN_FOR = 10000;

export const QP_WAIT = 5151;

export type QueryPerformanceDetail = {
  path: string;
  isFrameField: boolean;
};

/** A query on `path` ran long enough that an index or summary field helps */
export type QueryPerformanceEvents = {
  "query-performance:slow": QueryPerformanceDetail;
};

const hideQueryPerformanceToast = atom({
  key: "hideQueryPerformanceToast",
  default: false,
  effects: [
    getBrowserStorageEffectForKey("hideQueryPerformanceToast", {
      valueClass: "boolean",
      sessionStorage: true,
    }),
  ],
});

const QueryPerformanceToast = ({
  onClick = (isFrameFilter: boolean) => {
    const link = isFrameFilter ? SUMMARY_FIELDS : OPTIMIZING_QUERY_PERFORMANCE;
    window.open(link, "_blank")?.focus();
  },
  onDispatch = (detail: QueryPerformanceDetail) => {
    console.debug(detail);
  },
  text = "View Documentation",
}) => {
  const [data, setData] = useState<QueryPerformanceDetail | null>(null);
  const [disabled, setDisabled] = useRecoilState(hideQueryPerformanceToast);
  const element = document.getElementById("queryPerformance");
  const theme = useTheme();
  const trackEvent = useTrackEvent();

  const bus = useEventBus<QueryPerformanceEvents>();

  useEffect(
    () =>
      bus.on("query-performance:slow", (detail) => {
        onDispatch(detail);
        setData(detail);
      }),
    [bus, onDispatch],
  );

  if (!element) {
    throw new Error("no query performance element");
  }

  if (!data || disabled) {
    return null;
  }

  return createPortal(
    <Toast
      onHandleClose={() => setData(null)}
      duration={SHOWN_FOR}
      layout={{
        bottom: "100px !important",
        vertical: "bottom",
        horizontal: "center",
        backgroundColor: theme.custom.toastBackgroundColor,
      }}
      primary={() => {
        return (
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              onClick(data.isFrameField);
              trackEvent("query_performance_toast_clicked", {
                path: data.path,
              });
              setData(null);
            }}
            sx={{
              marginLeft: "auto",
              backgroundColor: theme.primary.main,
              color: theme.text.primary,
              boxShadow: 0,
            }} // Right align the button
          >
            {text}
          </Button>
        );
      }}
      secondary={() => {
        return (
          <div>
            <Button
              data-cy="btn-dismiss-query-performance-toast"
              variant="text"
              color="secondary"
              size="small"
              onClick={() => {
                setDisabled(true);
                trackEvent("query_performance_toast_dismissed", {
                  path: data.path,
                });
                setData(null);
              }}
              // Right align the button
              style={{ marginLeft: "auto", color: theme.text.secondary }}
            >
              Dismiss
            </Button>
          </div>
        );
      }}
      message={
        <>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Bolt sx={{ color: theme.custom.lightning, marginRight: "8px" }} />
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 500,
                marginRight: "8px",
                color: theme.text.primary,
              }}
            >
              Query Performance is Available!
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: theme.custom.lightning,
                borderRadius: "2px",
                padding: "2px 4px",
                fontSize: "1rem",
              }}
            >
              NEW
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: theme.text.secondary }}>
            Index the most critical fields for faster data loading and query
            performance.
          </Typography>
        </>
      }
    />,
    element,
  );
};

export default QueryPerformanceToast;
