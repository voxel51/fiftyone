import { useLighter } from "@fiftyone/lighter";
import { ANNOTATE_SHORTCUTS } from "./annotateActions";
import * as fos from "@fiftyone/state";
import { IconName, Orientation, Spacing, Stack } from "@voxel51/voodo";
import { useCallback } from "react";
import styled from "styled-components";
import { shortcutToHelpItems } from "../utils";
import ToolbarButton from "./ToolbarButton";

const ToolbarWrapper = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1;
`;

const ToolbarContainer = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.25rem 1rem;
  min-height: 42px;
  width: 100%;
  height: 100%;
  color: ${({ theme }) => theme.text.secondary};
  background-color: ${({ theme }) => theme.background.level3};
  box-shadow: 0 8px 15px 0 ${({ theme }) => theme.neutral.softBg};
`;

/**
 * Toolbar for the Lighter sample renderer (e.g. annotate mode).
 * Renders at the bottom of the Lighter canvas area.
 */
export const LighterToolbar = () => {
  const helpPanel = fos.useHelpPanel();
  const { zoomIn, zoomOut } = useLighter();

  const handleHelp = useCallback(() => {
    helpPanel.open(shortcutToHelpItems(ANNOTATE_SHORTCUTS));
  }, [helpPanel]);

  return (
    <ToolbarWrapper>
      <ToolbarContainer className="lighter-toolbar" data-cy="lighter-toolbar">
        <Stack orientation={Orientation.Row} spacing={Spacing.Md}>
          <ToolbarButton
            tooltip="Zoom out"
            icon={IconName.Remove}
            onClick={zoomOut}
          />
          <ToolbarButton
            tooltip="Zoom in"
            icon={IconName.Add}
            onClick={zoomIn}
            testId="zoom-in"
          />
          <ToolbarButton
            tooltip="Shortcuts & help"
            icon={IconName.Info}
            onClick={handleHelp}
          />
        </Stack>
      </ToolbarContainer>
    </ToolbarWrapper>
  );
};
