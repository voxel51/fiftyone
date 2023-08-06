import { IconButton, Popout } from "@fiftyone/components";
import { useOutsideClick } from "@fiftyone/state";
import { Add } from "@mui/icons-material";
import { useMemo, useRef, useState } from "react";
import { usePanels, useSpaceNodes } from "../hooks";
import { AddPanelButtonProps } from "../types";
import AddPanelItem from "./AddPanelItem";
import { AddPanelButtonContainer } from "./StyledElements";

export default function AddPanelButton({ node, spaceId }: AddPanelButtonProps) {
  const [open, setOpen] = useState(false);
  const panels = usePanels();
  const spaceNodes = useSpaceNodes(spaceId);
  const nodeTypes = useMemo(
    () => spaceNodes.map((node) => node.type),
    [spaceNodes]
  );
  const popoutRef = useRef();
  useOutsideClick(popoutRef, () => {
    setOpen(false);
  });

  const availablePanels = panels
    .filter(
      (panel) =>
        panel?.panelOptions?.allowDuplicates === true ||
        !nodeTypes.includes(panel.name)
    )
    .sort((panelA, panelB) => {
      if (panelA.name < panelB.name) return -1;
      if (panelA.name > panelB.name) return 1;
      return 0;
    });

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
        <Popout style={{ top: "80%", left: "16%", padding: 0 }}>
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
