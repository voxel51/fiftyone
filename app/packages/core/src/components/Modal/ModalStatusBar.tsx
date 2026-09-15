import { useModalStatusBarContent } from "@fiftyone/annotation";
import {
  Align,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { ReactNode } from "react";
import styled from "styled-components";

const Container = styled.div`
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1502;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
`;

const IconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.text.secondary};

  & > svg {
    font-size: 18px;
  }
`;

/**
 * Floating status display at the top of the modal sample pane, hidden when
 * nothing is registered. Mode-agnostic; registrars call `setContent`.
 */
export const ModalStatusBar = () => {
  const content = useModalStatusBarContent();
  if (!content) return null;
  return <Container data-cy="modal-status-bar">{content}</Container>;
};

/**
 * Common "icon + label" content for mode status bars.
 */
export const StatusItem = ({
  icon,
  label,
}: {
  icon: ReactNode;
  label: ReactNode;
}) => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Sm}
  >
    <IconWrap>{icon}</IconWrap>
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      {label}
    </Text>
  </Stack>
);

export default ModalStatusBar;
