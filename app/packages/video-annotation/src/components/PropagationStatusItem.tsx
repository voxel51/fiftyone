import {
  Align,
  Button,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";

/**
 * Right-hand top-bar status content for an in-flight propagation run. Drive
 * it through {@link useVideoAnnotationStatus}'s `setContent`: re-set on each
 * progress tick and clear (`null`) on completion. The `done`/`total` count
 * is shown only when both are provided — omit them for indeterminate phases
 * (e.g. one-time model download). `onStop`, when provided, renders a Stop
 * button — propagation polls the same flag via `shouldAbort`.
 *
 * @example
 * setContent(<PropagationStatusItem label="Loading SAM2…" onStop={stop} />);
 * setContent(<PropagationStatusItem label="SAM2 tracking" done={n} total={t} onStop={stop} />);
 */
export const PropagationStatusItem: React.FC<{
  label: string;
  done?: number;
  total?: number;
  onStop?: () => void;
}> = ({ label, done, total, onStop }) => {
  const text =
    typeof done === "number" && typeof total === "number"
      ? `${label} ${done}/${total}`
      : label;

  return (
    <Stack
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Sm}
    >
      <Spinner size={Size.Sm} />
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        {text}
      </Text>
      {onStop && (
        <Button variant={Variant.Secondary} size={Size.Sm} onClick={onStop}>
          Stop
        </Button>
      )}
    </Stack>
  );
};
