/**
 * Read-only widget that displays label and value as text.
 * No input—plain text only (like SchemaIO LabelValueView).
 */

import { WidgetProps } from "@rjsf/utils";
import {
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";

export default function LabelValueWidget(props: WidgetProps) {
  const { label, value } = props;
  const display = value != null ? String(value) : "No value provided";
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <Text color={TextColor.Secondary} variant={TextVariant.Lg}>
        {label}:
      </Text>
      <Text>{display}</Text>
    </Stack>
  );
}
