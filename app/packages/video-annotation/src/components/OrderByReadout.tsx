import {
  useActiveSampleId,
  useAnnotationEngine,
  useFrameValue,
} from "@fiftyone/annotation";
import {
  useDynamicGroupOrderBy,
  useIsImageDynamicGroupVideo,
} from "@fiftyone/state";
import { formatPrimitive, type Primitive } from "@fiftyone/utilities";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useRef } from "react";
import { useFieldType, useTimeZone } from "../state/accessors";
import { useCurrentFrame } from "../state/useCurrentFrame";
import styles from "./OrderByReadout.module.css";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * Beside the clock on a dynamic group played as video: the real order-by
 * value under the playhead, `(value)`, when it is not the frame number. The
 * text only ever widens, so playback never shifts the controls beside it.
 */
export const OrderByReadout: React.FC = () => {
  const frame = useCurrentFrame();
  const isDynamicGroup = useIsImageDynamicGroupVideo();
  const orderBy = useDynamicGroupOrderBy();
  const path = isDynamicGroup ? orderBy : null;
  const value = useFrameValue(useAnnotationEngine(), useActiveSampleId(), path);
  const ftype = useFieldType(path);
  const timeZone = useTimeZone();
  const width = useRef(0);

  if (value === undefined || String(value) === String(frame)) {
    return null;
  }

  const formatted = String(
    formatPrimitive({
      ftype: ftype ?? "",
      timeZone,
      value: value as Primitive,
    }) ?? value,
  );
  const text = `(${formatted})`;
  width.current = Math.max(width.current, text.length);

  return (
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      className={styles.readout}
      data-cy="timeline-order-by-readout"
      title={`${orderBy} at this frame; the group is ordered by it`}
      style={{ fontFamily: MONO }}
    >
      {text.padStart(width.current, "\u00a0")}
    </Text>
  );
};
