import {
  useInferenceStatus,
  useToolsContext,
} from "@fiftyone/annotation/src/agents";
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
import { ReactElement, useMemo } from "react";

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

const InferringContent = () => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Sm}
  >
    <Spinner size={Size.Md} />
    <Text variant={TextVariant.Md} color={TextColor.Primary}>
      Inferring...
    </Text>
  </Stack>
);

const FirstClickHint = () => (
  <Text variant={TextVariant.Md} color={TextColor.Secondary}>
    Click on an object to segment it
  </Text>
);

const PromptGuidance = () => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Md}
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
  </Stack>
);

/**
 * Returns the status-bar content for AI-assisted segmentation based on
 * current sub-state (no points yet → first-click hint, inferring → spinner,
 * otherwise → prompt guidance).
 *
 * Caller is responsible for only consuming this when AI mode is the active
 * segmentation tool — this hook does not check that.
 */
export const useAIAnnotationStatusContent = (): ReactElement => {
  const inferenceStatus = useInferenceStatus();
  const { positivePoints, negativePoints } = useToolsContext();
  const hasPoints =
    (positivePoints?.length ?? 0) + (negativePoints?.length ?? 0) > 0;

  return useMemo(() => {
    if (inferenceStatus === "inferring") return <InferringContent />;
    if (!hasPoints) return <FirstClickHint />;
    return <PromptGuidance />;
  }, [inferenceStatus, hasPoints]);
};
