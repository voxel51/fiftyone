/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure policy for assigning a positive/negative variant to a SAM2-style
 * point prompt, based on where the click lands relative to the current
 * mask and which modifier keys are held.
 */

import { DetectionOverlay, type Point } from "@fiftyone/lighter";
import { AnnotationLabel } from "@fiftyone/state";
import { ClickEventModifiers } from "@fiftyone/utilities";

/** Positive points are explicitly *included* in inference results. */
export const POSITIVE_POINT_VARIANT = "positive" as const;
/** Negative points are explicitly *excluded* from inference results. */
export const NEGATIVE_POINT_VARIANT = "negative" as const;

/** Union of supported point selection variants. */
export type PointSelectionVariant =
  | typeof POSITIVE_POINT_VARIANT
  | typeof NEGATIVE_POINT_VARIANT;

/**
 * Resolve the point variant with the given context.
 *
 * Points placed on the current label's mask are interpreted as negative;
 * points placed off-mask are positive. If shift is pressed while clicking,
 * the variants are inverted so the user can override the default polarity.
 *
 * Returns `POSITIVE_POINT_VARIANT` when the label has no mask-bearing
 * overlay attached (nothing to be on-mask of).
 *
 * @param relativePoint Point in relative coordinates
 * @param modifiers Click modifier keys (only `shiftKey` is consulted here)
 * @param label The annotation label to consult for mask hit detection
 */
export const resolvePointVariant = (
  relativePoint: Point,
  { shiftKey }: ClickEventModifiers,
  label: AnnotationLabel
): PointSelectionVariant => {
  const onMask =
    label && label.overlay instanceof DetectionOverlay
      ? label.overlay.containsMaskPixel(relativePoint)
      : false;

  const variant = onMask ? NEGATIVE_POINT_VARIANT : POSITIVE_POINT_VARIANT;

  if (!shiftKey) {
    return variant;
  }

  // Shift inverts the variant — lets the user override the on/off-mask
  // polarity for a specific click without leaving the tool.
  return variant === POSITIVE_POINT_VARIANT
    ? NEGATIVE_POINT_VARIANT
    : POSITIVE_POINT_VARIANT;
};
