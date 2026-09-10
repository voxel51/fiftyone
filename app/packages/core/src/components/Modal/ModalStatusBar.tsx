import {
  Align,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { atom, PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { ReactElement, ReactNode, useMemo } from "react";
import styled from "styled-components";

export type StatusContent = ReactElement | null;

const initialContent: StatusContent = null;
const statusContentAtom: PrimitiveAtom<StatusContent> = atom(initialContent);

// Overlay anchored to the top of the sample pane. `position: absolute` keeps
// it out of the flex flow so it never shrinks the sample canvas (which would
// change canvas dimensions and break e2e screenshots). `pointer-events: none`
// lets clicks pass through to the canvas during annotation.
const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  user-select: none;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  pointer-events: none;
  z-index: 1502;
`;

// Auto margins center the content when it fits and collapse to 0 when it
// overflows, so the scrollable region starts at the leftmost character
// instead of clipping it off.
const Inner = styled.div`
  margin: 0 auto;
  flex-shrink: 0;
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
 * Floating status / hint display at the top of the modal sample pane.
 * Renders whatever was registered via {@link useModalStatusBar}'s
 * `setContent`. Hidden when no content is registered.
 *
 * The bar is mode-agnostic; mode-specific registrar components call
 * `setContent` based on their own state.
 */
export const ModalStatusBar = () => {
  const content = useAtomValue(statusContentAtom);
  if (!content) return null;
  return (
    <Container data-cy="modal-status-bar">
      <Inner>{content}</Inner>
    </Container>
  );
};

/**
 * Hook for mode-specific status registrars. Call `setContent(<XStatus />)`
 * when the mode becomes active, `setContent(null)` when it leaves.
 *
 * Last-writer-wins; rely on conditional mounting so at most one writer is
 * mounted at a time and React's commit ordering (cleanup before next mount)
 * handles transitions.
 */
export const useModalStatusBar = () => {
  const setContent = useSetAtom(statusContentAtom);
  return useMemo(() => ({ setContent }), [setContent]);
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
