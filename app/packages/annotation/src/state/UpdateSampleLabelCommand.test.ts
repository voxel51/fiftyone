import type { EventDispatcher } from "@fiftyone/events";
import { Sample } from "@fiftyone/utilities";
import type { Schema } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnotationEventGroup } from "../events";
import { UpdateSampleLabelCommand } from "./UpdateSampleLabelCommand";

const schema = {
  ground_truth: {
    embeddedDocType: "fiftyone.core.labels.Detections",
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    fields: {
      detections: {
        ftype: "fiftyone.core.fields.ListField",
        subfield: "fiftyone.core.fields.EmbeddedDocumentField",
      },
    },
  },
} as unknown as Schema;

const makeSample = () =>
  new Sample({
    schema,
    data: {
      ground_truth: {
        _cls: "Detections",
        detections: [
          { _id: "d1", _cls: "Detection", label: "cat", tags: ["seed"] },
        ],
      },
    },
  });

const makeBus = () => {
  const dispatch = vi.fn();
  return {
    bus: { dispatch } as unknown as EventDispatcher<AnnotationEventGroup>,
    dispatch,
  };
};

const detection = (sample: Sample) =>
  sample.getLabel("ground_truth", "d1") as Record<string, unknown>;

describe("UpdateSampleLabelCommand", () => {
  let sample: Sample;

  beforeEach(() => {
    sample = makeSample();
  });

  it("writes the next label into Sample on execute, merging over the existing element", () => {
    const { bus } = makeBus();
    const next = { _id: "d1", _cls: "Detection", label: "dog", tags: ["seed"] };

    new UpdateSampleLabelCommand(
      sample,
      "ground_truth",
      "d1",
      next,
      { _id: "d1", _cls: "Detection", label: "cat", tags: ["seed"] },
      bus
    ).execute();

    expect(detection(sample)).toMatchObject({
      _id: "d1",
      _cls: "Detection",
      label: "dog",
      tags: ["seed"],
    });
  });

  it("exposes the full next label (with _id) for the command-executed sidebar bridge", () => {
    const { bus } = makeBus();
    const command = new UpdateSampleLabelCommand(
      sample,
      "ground_truth",
      "d1",
      { label: "dog" },
      { _id: "d1", label: "cat" },
      bus
    );

    expect(command.nextLabel).toMatchObject({ _id: "d1", label: "dog" });
  });

  it("does not emit annotation:labelEdit on the first execute (the user authored it)", () => {
    const { bus, dispatch } = makeBus();

    new UpdateSampleLabelCommand(
      sample,
      "ground_truth",
      "d1",
      { _id: "d1", label: "dog" },
      { _id: "d1", label: "cat" },
      bus
    ).execute();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("emits annotation:labelEdit on redo (a subsequent execute)", () => {
    const { bus, dispatch } = makeBus();
    const command = new UpdateSampleLabelCommand(
      sample,
      "ground_truth",
      "d1",
      { _id: "d1", label: "dog" },
      { _id: "d1", label: "cat" },
      bus
    );

    command.execute();
    command.execute();

    expect(dispatch).toHaveBeenCalledWith("annotation:labelEdit", {
      label: command.nextLabel,
    });
  });

  it("restores the previous label and emits annotation:undoLabelEdit on undo", () => {
    const { bus, dispatch } = makeBus();
    const prev = { _id: "d1", _cls: "Detection", label: "cat", tags: ["seed"] };
    const command = new UpdateSampleLabelCommand(
      sample,
      "ground_truth",
      "d1",
      { _id: "d1", _cls: "Detection", label: "dog", tags: ["seed"] },
      prev,
      bus
    );

    command.execute();
    expect(detection(sample)).toMatchObject({ label: "dog" });

    command.undo();

    expect(detection(sample)).toMatchObject({ label: "cat" });
    expect(dispatch).toHaveBeenCalledWith("annotation:undoLabelEdit", {
      label: prev,
    });
  });
});
