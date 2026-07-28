import { describe, expect, it } from "vitest";
import type { SyntheticBox } from "@fiftyone/utilities";

import { PropagationBrowserAgent } from "./PropagationBrowserAgent";
import {
  AgentTaskType,
  type PropagationContext,
  type SyncInferenceResult,
  type PropagationInferenceResult,
} from "./types";

function keyframe(
  id: string,
  bbox: [number, number, number, number],
  _id?: string,
): SyntheticBox {
  return {
    id,
    _id,
    label: "car",
    bounding_box: bbox,
    keyframe: true,
  };
}

const baseContext = {
  sampleDescriptor: { datasetId: "ds", sampleId: "s", mediaUrl: "x" },
  taskType: AgentTaskType.PROPAGATE,
  instanceId: "inst-1",
} as const;

describe("PropagationBrowserAgent.infer", () => {
  it("lerps a bbox between two keyframes and emits one Detection per in-between frame", async () => {
    const agent = new PropagationBrowserAgent();
    // For a tracked object both keyframes share one synthetic overlay id
    // (`instance-<...>`); their distinct mongo `_id`s are carried for identity.
    const left = keyframe("instance-inst-1", [0.0, 0.0, 0.1, 0.1], "oid-left");
    const right = keyframe(
      "instance-inst-1",
      [1.0, 1.0, 0.1, 0.1],
      "oid-right",
    );

    const context: PropagationContext = {
      ...baseContext,
      fromFrame: 5,
      toFrame: 15,
      parentKeyframes: [left, right],
    };

    const result = (await agent.infer(
      context,
    )) as SyncInferenceResult<PropagationInferenceResult> & { labelId: string };

    expect(result.type).toBe("sync");
    expect(result.taskType).toBe(AgentTaskType.PROPAGATE);
    expect(result.labelId).toBe("inst-1");
    expect(result.response.perFrame).toHaveLength(9);

    const midpoint = result.response.perFrame.find((e) => e.frameNumber === 10);
    expect(midpoint?.detection.bounding_box).toEqual([0.5, 0.5, 0.1, 0.1]);
    expect(midpoint?.detection.keyframe).toBe(false);
    expect(midpoint?.detection.instance).toEqual({
      _cls: "Instance",
      _id: "inst-1",
    });
  });

  // Interpolated detections must carry no `propagation` provenance blob. The
  // client persisted that blob against a baseline that held `propagation: null`
  // (written on keyframe promotion) while the server stored the field as
  // absent, so a later null→blob transition diffed as a `replace` over a
  // path the server can't resolve — the frame-patch error. No blob, no replace.
  it("emits no propagation provenance on interpolated detections", async () => {
    const agent = new PropagationBrowserAgent();
    const left = keyframe("instance-inst-1", [0.0, 0.0, 0.1, 0.1], "oid-left");
    const right = keyframe(
      "instance-inst-1",
      [1.0, 1.0, 0.1, 0.1],
      "oid-right",
    );

    const context: PropagationContext = {
      ...baseContext,
      fromFrame: 5,
      toFrame: 15,
      parentKeyframes: [left, right],
    };

    const result = (await agent.infer(
      context,
    )) as SyncInferenceResult<PropagationInferenceResult> & { labelId: string };

    for (const { detection } of result.response.perFrame) {
      expect(detection).not.toHaveProperty("propagation");
    }
  });
});
