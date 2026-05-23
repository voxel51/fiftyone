import { useSetTileSelection } from "@fiftyone/tiling";
import React, { useCallback } from "react";

import type { SceneUpdateVisualization } from "../../../decoders";
import {
  SceneUpdateBoxes,
  type SceneUpdatePickedEntity,
} from "../../../visualization/panels/scene-update-boxes";
import { useMcapAnnotationSelection } from "./mcap-annotation-selection-context";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { useMcapTopicStream } from "./use-mcap-topic-stream";
import { useMcapTfTree, useTfTransformMatrix } from "./use-tf-tree";

export interface McapLidarBoxesProps {
  /** Topic to subscribe to for scene-update messages. */
  readonly topic: string;
  /**
   * The frame the surrounding 3D scene renders in. Cubes from
   * `entity.frameId` get transformed into this frame via the TF tree.
   */
  readonly renderFrame: string;
}

/**
 * Lidar tile overlay: subscribes to a `foxglove.SceneUpdate` topic,
 * looks up the TF chain from the entity's frame to the render frame
 * at the current playhead, and draws the cubes inside the surrounding
 * R3F scene. Mounting kicks off the topic subscription and the
 * one-shot `/tf` history fetch; unmounting drops both.
 */
const McapLidarBoxes: React.FC<McapLidarBoxesProps> = ({
  topic,
  renderFrame,
}) => {
  const frame = useMcapTopicStream<SceneUpdateVisualization>(topic);
  const { tree, ready } = useMcapTfTree();
  const dataStream = useMcapDataStream();
  const timelineStartNs =
    dataStream?.getTimelineIndex()?.startTimeNs ?? 0n;

  // All entities in a single message share the same frameId in practice,
  // but the schema doesn't promise it. We pull from the first entity and
  // accept that mixed-frame messages won't be handled in this pass.
  const sourceFrame = frame?.entities[0]?.frameId ?? "";
  const matrix = useTfTransformMatrix(
    ready ? tree : null,
    sourceFrame,
    renderFrame,
    timelineStartNs
  );

  const setSelection = useSetTileSelection();
  const { selectedKey, setSelectedKey } = useMcapAnnotationSelection();

  const handleSelect = useCallback(
    (picked: SceneUpdatePickedEntity) => {
      setSelectedKey(picked.key);
      setSelection({
        kind: "scene-annotation",
        topic,
        entityId: picked.entityId,
        cubeIndex: picked.cubeIndex,
        color: picked.color,
        label: picked.label,
        frameId: picked.entity.frameId,
        metadata: picked.entity.metadata,
        cube: picked.cube,
      });
    },
    [setSelection, topic]
  );

  if (!frame) return null;
  // Until TF is ready we'd render boxes at world origin (wrong place),
  // which is more confusing than just waiting. Skip until we have a
  // matrix.
  if (sourceFrame && !matrix) return null;

  return (
    <SceneUpdateBoxes
      visualization={frame}
      worldMatrix={matrix ?? null}
      selectedKey={selectedKey}
      onSelectPrimitive={handleSelect}
    />
  );
};

export default McapLidarBoxes;
