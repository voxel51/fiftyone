import { IconButton, Popout, scrollable } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Add } from "@mui/icons-material";
import { useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { usePanels, useSpaceNodes } from "../hooks";
import { AddPanelButtonProps } from "../types";
import AddPanelItem from "./AddPanelItem";
import { AddPanelButtonContainer } from "./StyledElements";
import { panelsCompareFn } from "../utils/sort";

export default function AddPanelButton({ node, spaceId }: AddPanelButtonProps) {
  const [open, setOpen] = useState(false);
  const isModalActive = useRecoilValue(fos.isModalActive);
  const panels = usePanels((panel) => {
    if (isModalActive) {
      return panel.surfaces === "modal" || panel.surfaces === "grid modal";
    }

    if (panel.surfaces === "modal") return false;

    return true;
  });
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
