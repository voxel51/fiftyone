import { useInferenceStatus } from "@fiftyone/annotation/src/agents";
import {
  Align,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import styled from "styled-components";
import { useIsAIAnnotationModeActive } from "./Sidebar/Annotate/Edit/useAIAnnotationMode";

const Container = styled(Stack)`
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1502;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
`;

const Marker = ({ color, label }: { color: TextColor; label: string }) => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Xs}
  >
    <Text variant={TextVariant.Md} color={color}>
      ●
    </Text>
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      {label}
    </Text>
  </Stack>
);

const Separator = () => (
  <Text variant={TextVariant.Md} color={TextColor.Tertiary}>
    ·
  </Text>
);

/**
 * Floating status / guidance display shown at the top of the modal sample
 * pane while AI-assisted annotation mode is active.
 *
 * - Idle: shows positive/negative prompt guidance.
 * - Inferring: shows a spinner with "Inferring..." while the agent is running.
 */
export const AIAnnotationStatusBar = () => {
  const isActive = useIsAIAnnotationModeActive();
  const status = useInferenceStatus();

  if (!isActive) return null;

  if (status === "inferring") {
    return (
      <Container
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
        data-cy="ai-annotation-status-bar"
      >
        <Spinner size={Size.Md} />
        <Text variant={TextVariant.Md} color={TextColor.Primary}>
          Inferring...
        </Text>
      </Container>
    );
  }

  return (
    <Container
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Md}
      data-cy="ai-annotation-status-bar"
    >
      <Marker color={TextColor.Success} label="Positive prompt" />
      <Marker color={TextColor.Destructive} label="Negative prompt" />
      <Separator />
      <Text variant={TextVariant.Md} color={TextColor.Secondary}>
        Shift = Invert
      </Text>
      <Separator />
      <Text variant={TextVariant.Md} color={TextColor.Secondary}>
        Click marker to remove
      </Text>
    </Container>
  );
};

export default AIAnnotationStatusBar;
