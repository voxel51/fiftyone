import { IconButton, Popout, scrollable, useTheme } from "@fiftyone/components";
import {
  Categories,
  getCategoryForPanel,
  getCategoryLabel,
  PluginComponentRegistration,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { Add } from "@mui/icons-material";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { usePanels, useSpaceNodes } from "../hooks";
import { AddPanelButtonProps } from "../types";
import { panelsCompareFn } from "../utils/sort";
import AddPanelItem from "./AddPanelItem";
import { AddPanelButtonContainer } from "./StyledElements";
import { Typography, Grid } from "@mui/material";

export default function AddPanelButton({ node, spaceId }: AddPanelButtonProps) {
  const [open, setOpen] = useState(false);
  const isModalActive = useRecoilValue(fos.isModalActive);
  const panelsPredicate = useCallback(
    (panel: PluginComponentRegistration) => {
      const surface = panel.panelOptions?.surfaces;
      if (isModalActive) {
        return surface === "modal" || surface === "grid modal";
      }
      return surface !== "modal";
    },
    [isModalActive]
  );
  const panels = usePanels(panelsPredicate);
  const spaceNodes = useSpaceNodes(spaceId);
  const nodeTypes = useMemo(() => {
    return spaceNodes.map((node) => node.type);
  }, [spaceNodes]);
  const popoutRef = useRef();
  fos.useOutsideClick(popoutRef, () => {
    setOpen(false);
  });

  const availablePanels = panels
    .filter((panel) => {
      return (
        panel?.panelOptions?.allowDuplicates === true ||
        !nodeTypes.includes(panel.name)
      );
    })
    .sort(panelsCompareFn);

  const categorizedPanels = availablePanels.reduce((acc, panel) => {
    const category = getCategoryForPanel(panel);
    if (!acc[category]) {
      acc[category] = {
        label: getCategoryLabel(category),
        panels: [],
      };
    }
    acc[category].panels.push(panel);
    return acc;
  }, {});

  if (availablePanels.length === 0) return null;

  const sortedCategories = ["import", "curate", "analyze", "custom"]
    .map((cat) => categorizedPanels[cat])
    .filter((c) => c);

  return (
    <AddPanelButtonContainer ref={popoutRef}>
      <IconButton
        onClick={() => setOpen(!open)}
        title="New panel"
        data-cy="new-panel-btn"
      >
        <Add sx={{ fontSize: 16 }} />
      </IconButton>
      {open && (
        <Popout
          style={{
            top: "80%",
            left: "16%",
            padding: 0,
            maxHeight: "calc(90vh - 120px)",
            overflow: "auto",
          }}
          popoutProps={{ className: scrollable }}
        >
          <PanelCategories>
            {sortedCategories.map(({ label, panels }) => (
              <PanelCategory key={label} label={label}>
                {panels.map((panel) => (
                  <AddPanelItem
                    key={panel.name}
                    node={node}
                    name={panel.name}
                    label={panel.label}
                    spaceId={spaceId}
                    showBeta={panel.panelOptions?.beta}
                    showNew={panel.panelOptions?.isNew}
                    onClick={() => setOpen(false)}
                  />
                ))}
              </PanelCategory>
            ))}
          </PanelCategories>
        </Popout>
      )}
    </AddPanelButtonContainer>
  );
}

function PanelCategories({ children }) {
  return (
    <Grid container gap={1} sx={{ p: 1 }}>
      {children}
    </Grid>
  );
}

function PanelCategory({ label, children }) {
  const theme = useTheme();
  return (
    <Grid item>
      <Typography
        variant="subtitle2"
        sx={{ padding: "0 8px", color: theme.text.secondary }}
      >
        {label || "no category"}
      </Typography>
      {children}
    </Grid>
  );
}
