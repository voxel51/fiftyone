import { useLighter } from "@fiftyone/lighter";
import { IMAVID_SHORTCUTS } from "@fiftyone/looker/src/elements/common/actions";
import * as fos from "@fiftyone/state";
import {
  Clickable,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
} from "@voxel51/voodo";
import { useCallback } from "react";
import styled from "styled-components";
import { shortcutToHelpItems } from "../utils";

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
  min-height: 37px;
  width: 100%;
  height: 100%;
  color: ${({ theme }) => theme.text.secondary};
  background-color: ${({ theme }) => theme.background.level3};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  box-shadow: 0 8px 15px 0 ${({ theme }) => theme.neutral.softBg};
  border-right: 0;
`;

/**
 * Toolbar for the Lighter sample renderer (e.g. annotate mode).
 * Renders at the bottom of the Lighter canvas area.
 */
export const LighterToolbar = () => {
  const helpPanel = fos.useHelpPanel();
  const { zoomIn, zoomOut } = useLighter();

  const handleHelp = useCallback(() => {
    helpPanel.open(shortcutToHelpItems(IMAVID_SHORTCUTS));
  }, [helpPanel]);

  return (
    <ToolbarWrapper>
      <ToolbarContainer className="lighter-toolbar" data-cy="lighter-toolbar">
        <Stack orientation={Orientation.Row} spacing={Spacing.Md}>
          <Clickable onClick={zoomOut}>
            <Icon name={IconName.Remove} size={Size.Lg} />
          </Clickable>
          <Clickable onClick={zoomIn}>
            <Icon name={IconName.Add} size={Size.Lg} />
          </Clickable>
          <Clickable onClick={handleHelp}>
            <Icon name={IconName.Info} size={Size.Lg} />
          </Clickable>
        </Stack>
      </ToolbarContainer>
    </ToolbarWrapper>
  );
};
