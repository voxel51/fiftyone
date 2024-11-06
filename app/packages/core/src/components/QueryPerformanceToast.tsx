import { Toast } from "@fiftyone/components";
import { QP_MODE, QP_MODE_SUMMARY } from "@fiftyone/core";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { Box, Button, Typography } from "@mui/material";
import { Bolt } from "@mui/icons-material";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { atom, useRecoilState, useRecoilValue } from "recoil";
import { useTheme } from "@fiftyone/components";
import * as atoms from "@fiftyone/state/src/recoil/atoms";
import * as fos from "@fiftyone/state";
import { useTrackEvent } from "@fiftyone/analytics";

const SHOWN_FOR = 10000;

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
  const [path, setPath] = useState("");
  const indexed = useRecoilValue(fos.pathHasIndexes(path));
  const [shown, setShown] = useState(false);
  const [disabled, setDisabled] = useRecoilState(hideQueryPerformanceToast);
  const element = document.getElementById("queryPerformance");
  const theme = useTheme();
  const frameFields = useRecoilValue(atoms.frameFields);
  const trackEvent = useTrackEvent();

  useEffect(() => {
    const listen = (event) => {
      onDispatch(event);
      setPath(event.path);
      setShown(true);
    };
    window.addEventListener("queryperformance", listen);
    return () => window.removeEventListener("queryperformance", listen);
  }, []);

  if (!element) {
    throw new Error("no query performance element");
  }

  if (!shown || disabled) {
    return null;
  }

  // don't show the toast if the path is already indexed
  if (path && indexed) {
    return null;
  }

  return createPortal(
    <Toast
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
              onClick(
                frameFields.some((frame) =>
                  path.includes(`frames.${frame.path}`)
                )
              );
              trackEvent("query_performance_toast_clicked", { path: path });
              setShown(false);
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
                trackEvent("query_performance_toast_dismissed", { path: path });
                setShown(false);
              }}
              style={{ marginLeft: "auto", color: theme.text.secondary }} // Right align the button
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
