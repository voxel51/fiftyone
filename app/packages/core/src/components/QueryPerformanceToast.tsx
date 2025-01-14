import { useTrackEvent } from "@fiftyone/analytics";
import { Toast, useTheme } from "@fiftyone/components";
import { QP_MODE, QP_MODE_SUMMARY } from "@fiftyone/core";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { Bolt } from "@mui/icons-material";
import { Box, Button, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { atom, useRecoilState } from "recoil";

const SHOWN_FOR = 10000;

export const QP_WAIT = 5151;

declare global {
  interface WindowEventMap
    extends GlobalEventHandlersEventMap,
      WindowEventHandlersEventMap {
    queryperformance: QueryPerformanceToastEvent;
  }
}
export class QueryPerformanceToastEvent extends Event {
  isFrameField: boolean;
  path: string;

  constructor(path: string, isFrameField: boolean) {
    super("queryperformance");
    this.path = path;
    this.isFrameField = isFrameField;
  }
}

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
    const link = isFrameFilter ? QP_MODE_SUMMARY : QP_MODE;
    window.open(link, "_blank")?.focus();
  },
  onDispatch = (event) => {
    console.debug(event);
  },
  text = "View Documentation",
}) => {
  const [data, setData] = useState<{
    path: string;
    isFrameField: boolean;
  } | null>(null);
  const [disabled, setDisabled] = useRecoilState(hideQueryPerformanceToast);
  const element = document.getElementById("queryPerformance");
  const theme = useTheme();
  const trackEvent = useTrackEvent();

  useEffect(() => {
    const listen = (event: QueryPerformanceToastEvent) => {
      onDispatch(event);
      setData({ path: event.path, isFrameField: event.isFrameField });
    };
    window.addEventListener("queryperformance", listen);
    return () => window.removeEventListener("queryperformance", listen);
  }, [onDispatch]);

  if (!element) {
    throw new Error("no query performance element");
  }

  if (!data || disabled) {
    return null;
  }

  // NOTE: this is a one-off case where we disable the component in playwright
  // so that this banner doesn't interfere with the tests.
  // waiting for analytics to show up before we can dismiss it is a pain
  // and adds significant time to the tests.
  // we should usually _never_ have any divergence between tests and prod.
  if (window.IS_PLAYWRIGHT) {
    console.log("Query performance toast is disabled in playwright");
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
    element
  );
};

export default QueryPerformanceToast;
