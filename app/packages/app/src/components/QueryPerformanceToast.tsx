import { Toast } from "@fiftyone/components";
import { QP_MODE } from "@fiftyone/core";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { Box, Button, Typography } from "@mui/material";
import { Bolt } from "@mui/icons-material";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { atom, useRecoilState } from "recoil";
import { useTheme } from "@fiftyone/components";

const SHOWN_FOR = 50000;

const hideQueryPerformanceToast = atom({
  key: "hideQueryPerformanceToast",
  default: false,
  effects: [
    getBrowserStorageEffectForKey("hideQueryPerformanceToast", {
      valueClass: "boolean",
    }),
  ],
});

const QueryPerformanceToast = () => {
  const [shown, setShown] = useState(false);
  const [disabled, setDisabled] = useRecoilState(hideQueryPerformanceToast);
  const element = document.getElementById("queryPerformance");
  const theme = useTheme();
  useEffect(() => {
    const listen = () => {
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

  return createPortal(
    <Toast
      duration={SHOWN_FOR}
      layout={{ bottom: '100px', vertical: "bottom", horizontal: "center"}}
      primary={(setOpen) => {
        return (
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              open(QP_MODE, "_blank")?.focus();
              setOpen(false);
            }}
            sx={{ marginLeft: "auto", backgroundColor: theme.primary.main, color: theme.text.primary, boxShadow: 0 }} // Right align the button
          >
            View Documentation
          </Button>
        );
      }}
      secondary={(setOpen) => {
        return (
          <div>
            <Button
              variant="text"
              color="secondary"
              size="small"
              onClick={() => {
                setDisabled(true);
                setOpen(false);
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
            <Bolt sx={{ color: "#f5b700", marginRight: "8px" }} />
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 500, marginRight: "8px", color: theme.text.primary }}
            >
              Query Performance is Available!
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#f5b700",
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
