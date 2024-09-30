import { IconButton, Popout, scrollable } from "@fiftyone/components";
import { PluginComponentRegistration } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { Add } from "@mui/icons-material";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { usePanels, useSpaceNodes } from "../hooks";
import { AddPanelButtonProps } from "../types";
import { panelsCompareFn } from "../utils/sort";
import AddPanelItem from "./AddPanelItem";
import { AddPanelButtonContainer } from "./StyledElements";

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
    return spaceNodes.map((node) => {
      return node.type;
    });
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

  if (availablePanels.length === 0) return null;

  return (
    <AddPanelButtonContainer ref={popoutRef}>
      <IconButton
        onClick={() => {
          setOpen(!open);
        }}
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
          {availablePanels.map((panel) => (
            <AddPanelItem
              key={panel.name}
              spaceId={spaceId}
              {...panel}
              node={node}
              onClick={() => setOpen(!open)}
            />
          ))}
        </Popout>
      )}
    </AddPanelButtonContainer>
  );
}
