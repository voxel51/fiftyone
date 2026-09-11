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
 * Modal status bar content for an in-flight propagation run; set it through
 * `useModalStatusBar`'s `setContent` on each progress tick and clear it with
 * `null` on completion. `done`/`total` render only when both are provided,
 * and `onStop` renders a Stop button.
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
