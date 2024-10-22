import { Toast } from "@fiftyone/components";
import { QP_MODE } from "@fiftyone/core";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { Box, Button, Typography } from "@material-ui/core";
import { Bolt } from "@mui/icons-material";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { atom, useRecoilState } from "recoil";

const TIMEOUT = 5000;

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

  if (!element) {
    throw new Error("no query performance element");
  }

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const listen = () => {
      timeout && clearTimeout(timeout);
      setShown(true);

      timeout = setTimeout(() => {
        timeout = null;
        setShown(false);
      }, TIMEOUT);
    };

    window.addEventListener("queryperformance", listen);

    return () => window.removeEventListener("queryperformance", listen);
  }, []);

  if (!shown || disabled) {
    return null;
  }

  return createPortal(
    <Toast
      action={
        <div>
          <Button
            variant="contained"
            size="small"
            onClick={() => open(QP_MODE, "_blank")?.focus()}
            style={{ marginLeft: "auto" }} // Right align the button
          >
            View Documentation
          </Button>
          <Button
            variant="text"
            color="secondary"
            size="small"
            onClick={() => setDisabled(true)}
            style={{ marginLeft: "auto" }} // Right align the button
          >
            Don&apos;t show me again
          </Button>
        </div>
      }
      message={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "1px dashed #90caf9",
            borderRadius: "4px",
            padding: "8px",
            width: "100%",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Bolt sx={{ color: "#f5b700", marginRight: "8px" }} />
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 500, marginRight: "8px" }}
            >
              Query Performance is Available!
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#fff",
                borderRadius: "2px",
                padding: "2px 4px",
                fontWeight: 600,
              }}
            >
              NEW
            </Typography>
          </Box>
          <br />
          <Typography variant="body2" sx={{ color: "#757575" }}>
            Index the most critical fields for faster data loading and query
            performance.
          </Typography>
        </Box>
      }
    />,
    element
  );
};

export default QueryPerformanceToast;
