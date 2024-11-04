import { Toast } from "@fiftyone/components";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { Box, Button, Typography } from "@mui/material";
import { Bolt } from "@mui/icons-material";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { atom, useRecoilState } from "recoil";
import { useTheme } from "@fiftyone/components";
import { usePromptOperatorInput } from "@fiftyone/operators/src/state";
import { useSpaces, useSpaceNodes, SpaceNode } from "@fiftyone/spaces";
import { usePanelEvent } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";

const SHOWN_FOR = 5000;

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
  const [path, setPath] = useState<string | undefined>(undefined);
  const [disabled, setDisabled] = useRecoilState(hideQueryPerformanceToast);
  const element = document.getElementById("queryPerformance");
  const theme = useTheme();
  const promptForOperator = usePromptOperatorInput();
  const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
  const { spaces } = useSpaces(FIFTYONE_GRID_SPACES_ID);
  const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
  const PANEL_NAME = "query_performance_panel";
  const triggerPanelEvent = usePanelEvent();

  useEffect(() => {
    const listen = (event) => {
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

  return createPortal(
    <Toast
      duration={SHOWN_FOR}
      layout={{
        bottom: "100px !important",
        vertical: "bottom",
        horizontal: "center",
        backgroundColor: theme.custom.toastBackgroundColor,
      }}
      primary={(setOpen) => {
        return (
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              let openedPanel = openedPanels.find(
                ({ type }) => type === PANEL_NAME
              );
              if (!openedPanel) {
                openedPanel = new SpaceNode();
                openedPanel.type = PANEL_NAME;
                spaces.addNodeAfter(spaces.root, openedPanel, true);
              }
              if (path) {
                promptForOperator(
                  "index_field_creation_operator",
                  { nonperformant_field: path },
                  {
                    callback: () => {
                      triggerPanelEvent(openedPanel.id, {
                        operator: PANEL_NAME + "#refresh",
                      });
                    },
                  }
                );
              }
              setOpen(false);
            }}
            sx={{
              marginLeft: "auto",
              backgroundColor: theme.primary.main,
              color: theme.text.primary,
              boxShadow: 0,
            }} // Right align the button
          >
            Create an Index
          </Button>
        );
      }}
      secondary={(setOpen) => {
        return (
          <div>
            <Button
              data-cy="btn-dismiss-query-performance-toast"
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
