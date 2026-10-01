/**
 * Single-label frame fields end to end: raw `/frames` documents seed the
 * engine, the playhead's frame picks the value the sidebar reads, and edits on
 * a dynamic group persist to the member sample at that frame.
 */

import {
  AnnotationEngine,
  type Clock,
  FrameStore,
  FrameTemporalView,
  singletonAddressId,
} from "@fiftyone/annotation";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { toMemberPatches } from "../utils/memberPatches";
import { type FrameDocLike, parseFramesData } from "./framesData";

const makeClock = () => {
  let time = 1;
  const listeners = new Set<(t: number) => void>();
  const clock: Clock = {
    getTime: () => time,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    clock,
    seek: (next: number) => {
      time = next;
      for (const listener of listeners) listener(next);
    },
  };
};

const seed = (
  sample: string,
  labelTypes: Record<string, LabelType>,
  docs: FrameDocLike[],
) => {
  const { clock, seek } = makeClock();
  const engine = new AnnotationEngine({
    temporal: (e) => new FrameTemporalView(e, clock, (t) => t),
  });
  const store = new FrameStore(sample, { labelTypes });
  engine.registerStore(store);
  store.setData(parseFramesData(docs, labelTypes));

  return { engine, store, seek };
};

describe("single-label frame fields", () => {
  it("presents the playhead frame's value for the sidebar", () => {
    const { engine, seek } = seed(
      "video",
      { "frames.cls": LabelType.Classification },
      [
        {
          frame_number: 1,
          cls: { _id: "c1", _cls: "Classification", label: "cat" },
        },
        {
          frame_number: 2,
          cls: { _id: "c2", _cls: "Classification", label: "dog" },
        },
      ],
    );

    const rows = () =>
      engine.temporal
        .getPresent()
        .map((ref) => [ref.instanceId, engine.getLabel(ref)?.label]);

    expect(rows()).toEqual([[singletonAddressId("frames.cls"), "cat"]]);

    seek(2);
    expect(rows()).toEqual([[singletonAddressId("frames.cls"), "dog"]]);

    seek(3);
    expect(rows()).toEqual([]);
  });

  it("persists dynamic group edits to the member at each frame", () => {
    const { engine, store } = seed("m1", { cls: LabelType.Classification }, [
      { frame_number: 1, cls: { _id: "c1", _cls: "Classification" } },
      { frame_number: 2 },
      {
        frame_number: 3,
        cls: { _id: "c3", _cls: "Classification", label: "cat" },
      },
    ]);
    const at = (frame: number) => ({
      sample: "m1",
      path: "cls",
      instanceId: singletonAddressId("cls"),
      frame,
    });

    engine.deleteLabel(at(1));
    engine.updateLabel(at(2), { _cls: "Classification", label: "dog" });
    engine.updateLabel(at(3), { label: "wolf" });

    const created = store.getLabel(at(2))?._docId;
    const { patches, rest } = toMemberPatches(
      store.getJsonPatch(),
      ["m1", "m2", "m3"],
      "m1",
    );

    expect(rest).toEqual([]);
    expect(patches).toEqual([
      { sampleId: "m1", patch: [{ op: "remove", path: "/cls" }] },
      {
        sampleId: "m2",
        patch: [
          {
            op: "add",
            path: "/cls",
            value: { _id: created, _cls: "Classification", label: "dog" },
          },
        ],
      },
      {
        sampleId: "m3",
        patch: [{ op: "replace", path: "/cls/label", value: "wolf" }],
      },
    ]);
  });
});
