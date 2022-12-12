import { Popout } from "@fiftyone/components";
import { useMemo, useState } from "react";
import { usePanels, useSpaceNodes } from "../hooks";
import { AddPanelButtonProps } from "../types";
import AddPanelItem from "./AddPanelItem";
import { AddPanelButtonContainer, GhostButton } from "./StyledElements";

export default function AddPanelButton({ node, spaceId }: AddPanelButtonProps) {
  const [open, setOpen] = useState(false);
  const panels = usePanels();
  const spaceNodes = useSpaceNodes(spaceId);
  const nodeTypes = useMemo(
    () => spaceNodes.map((node) => node.type),
    [spaceNodes]
  );

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
    <AddPanelButtonContainer>
      <GhostButton
        onClick={() => {
          setOpen(!open);
        }}
      >
        +
      </GhostButton>
      {open && (
        <Popout style={{ top: "80%", left: "16%", padding: 0 }}>
          {availablePanels.map((panel) => (
            <AddPanelItem
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
