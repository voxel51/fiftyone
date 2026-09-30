import { useModalStatusBarContent } from "@fiftyone/annotation";
import {
  Anchor,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import { Fragment } from "react";
import styled from "styled-components";

// Matches the panel tab strip the bar sits over (`StyledPanel` subtracts the
// same height), so bar content is centered in that strip.
const TAB_STRIP_HEIGHT = "28px";

// Anchored to the right edge only — with no `left`, the box shrink-wraps its
// content and grows leftward, so it cannot reach the tabs at the left of the
// strip. `position: absolute` keeps it out of the flex flow so it never
// shrinks the sample canvas.
const Container = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  max-width: 100%;
  height: ${TAB_STRIP_HEIGHT};
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 8px;
  z-index: 1502;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
`;

// Truncates rather than growing left indefinitely; anything at risk of being
// cut short (a long error message) should also be in `help`.
const Status = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Wraps the tooltip rather than the trigger itself: `Tooltip` renders its own
// wrapper element around children, so it — not the trigger — is the flex item.
// Only this slot takes pointer events; the rest of the bar lets clicks fall
// through to the tab strip and canvas beneath it.
const HelpSlot = styled.div`
  flex: none;
  display: inline-flex;
  align-items: center;
  pointer-events: auto;
`;

const HelpTrigger = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: help;
  opacity: 0.7;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 1;
  }
`;

/**
 * Status / hint display at the top right of the modal sample pane. Renders
 * whatever was registered via {@link useModalStatusBar}'s `setContent`, and
 * nothing at all when no content is registered.
 *
 * The bar is mode-agnostic; mode-specific registrar components call
 * `setContent` based on their own state.
 */
export const ModalStatusBar = () => {
  const content = useModalStatusBarContent();
  if (!content) return null;
  if (!content.status && !content.help) return null;

  return (
    <Container data-cy="modal-status-bar">
      {content.status && <Status>{content.status}</Status>}
      {content.help && (
        <HelpSlot>
          <Tooltip content={content.help} anchor={Anchor.Bottom} portal>
            <HelpTrigger
              data-cy="modal-status-bar-help"
              aria-label="Show instructions"
            >
              <Icon
                name={IconName.Info}
                size={Size.Sm}
                color={TextColor.Secondary}
              />
              <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                Help
              </Text>
            </HelpTrigger>
          </Tooltip>
        </HelpSlot>
      )}
    </Container>
  );
};

export type StatusHelpEntry = {
  /** The gesture or key, e.g. `"Alt + click"`. */
  gesture: string;
  /** What that gesture does. */
  description: string;
};

const HelpEntries = styled.div`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 12px;
  align-items: baseline;
  /* inside the tooltip panel's own 500px cap, with room for the longer
     multi-sentence descriptions */
  max-width: 440px;
  white-space: normal;
`;

/**
 * Common help content for mode status bars: the mode's name over a
 * gesture/description table, for the {@link StatusContent} `help` slot.
 */
export const StatusHelp = ({
  title,
  entries,
}: {
  title: string;
  entries: StatusHelpEntry[];
}) => (
  <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
    <Text variant={TextVariant.Label} color={TextColor.Primary}>
      {title}
    </Text>
    <HelpEntries>
      {entries.map(({ gesture, description }) => (
        <Fragment key={gesture}>
          <Text variant={TextVariant.Sm} color={TextColor.Primary}>
            {gesture}
          </Text>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            {description}
          </Text>
        </Fragment>
      ))}
    </HelpEntries>
  </Stack>
);

export default ModalStatusBar;
