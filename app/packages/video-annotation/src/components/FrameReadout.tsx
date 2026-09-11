import {
  useActiveSampleId,
  useAnnotationEngine,
  useFrameValue,
} from "@fiftyone/annotation";
import {
  useDynamicGroupOrderBy,
  useIsImageDynamicGroupVideo,
  useModalSample,
} from "@fiftyone/state";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useAnnotatePrerequisites } from "../hooks/useAnnotatePrerequisites";
import { useCurrentFrame } from "../state/useCurrentFrame";
import styles from "./FrameReadout.module.css";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * The 1-indexed frame under the playhead beside the clock, `#frame / #total`.
 * A dynamic group also shows the real order-by value when it is not the frame.
 */
export const FrameReadout: React.FC = () => {
  const frame = useCurrentFrame();
  const { frameCount } = useAnnotatePrerequisites(useModalSample());
  const isDynamicGroup = useIsImageDynamicGroupVideo();
  const orderBy = useDynamicGroupOrderBy();
  const orderByValue = useFrameValue(
    useAnnotationEngine(),
    useActiveSampleId(),
    isDynamicGroup ? orderBy : null,
  );

  if (frame < 1 || !frameCount) {
    return null;
  }

  const suffix =
    orderByValue !== undefined && String(orderByValue) !== String(frame)
      ? ` (${String(orderByValue)})`
      : "";
  const hint = isDynamicGroup
    ? `Frame under the playhead${orderBy ? `; the group is ordered by ${orderBy}` : ""}`
    : "Frame under the playhead";

  return (
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      className={styles.readout}
      data-cy="timeline-frame-readout"
      title={hint}
      style={{ fontFamily: MONO }}
    >
      {`#${frame} / #${frameCount}${suffix}`}
    </Text>
  );
};
