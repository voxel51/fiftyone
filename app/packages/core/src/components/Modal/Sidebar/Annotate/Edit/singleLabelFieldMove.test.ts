import { AnnotationEngine } from "@fiftyone/annotation/src/engine/core/engine";
import { singletonAddressId } from "@fiftyone/annotation/src/engine/identity/ref";
import { FrameStore } from "@fiftyone/annotation/src/engine/store/frameStore";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import { moveSingleLabel } from "./singleLabelFieldMove";

const SAMPLE = "video";
const FRAME = 2;

const slotOf = (path: string) =>
  path.startsWith("frames.")
    ? { instanceId: singletonAddressId(path), frame: FRAME }
    : undefined;

const isFrameField = (path: string) => path.startsWith("frames.");

const base = (_path: string, id: string) => ({
  _id: id,
  _cls: "Classification",
});

describe("moveSingleLabel", () => {
  it("moves only the playhead frame's value, keeping its document", () => {
    const engine = new AnnotationEngine();
    const cls = (frame: number) => ({
      _id: singletonAddressId("frames.a"),
      _docId: `doc-${frame}`,
      _cls: "Classification",
      label: "cat",
    });
    const store = new FrameStore(SAMPLE, {
      labelTypes: {
        "frames.a": LabelType.Classification,
        "frames.b": LabelType.Classification,
      },
      data: {
        1: { "frames.a": [cls(1)], "frames.b": [] },
        2: { "frames.a": [cls(2)], "frames.b": [] },
      },
    });
    engine.registerStore(store);

    const moved = moveSingleLabel({
      engine,
      sample: SAMPLE,
      from: "frames.a",
      to: "frames.b",
      docId: "doc-2",
      slotOf,
      isFrameField,
      base,
    });

    expect(moved).toBe("moved");
    expect(store.getJsonPatch()).toEqual([
      { op: "remove", path: "/frames/2/a" },
      {
        op: "add",
        path: "/frames/2/b",
        value: { _id: "doc-2", _cls: "Classification", label: "cat" },
      },
    ]);
  });

  it("re-keys a frame value moved to a sample field by its document id", () => {
    const engine = {
      getLabel: vi.fn(() => ({
        _id: singletonAddressId("frames.a"),
        _docId: "doc-2",
        _cls: "Classification",
        label: "cat",
      })),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
      transaction: (fn: () => void) => fn(),
    };

    moveSingleLabel({
      engine,
      sample: SAMPLE,
      from: "frames.a",
      to: "clip",
      docId: "doc-2",
      slotOf,
      isFrameField,
      base,
    });

    expect(engine.deleteLabel).toHaveBeenCalledWith({
      sample: SAMPLE,
      path: "frames.a",
      instanceId: singletonAddressId("frames.a"),
      frame: FRAME,
    });
    expect(engine.updateLabel).toHaveBeenCalledWith(
      { sample: SAMPLE, path: "clip", instanceId: "doc-2" },
      { _id: "doc-2", _cls: "Classification", label: "cat" },
    );
  });

  it("refuses a frame field that holds a list", () => {
    const engine = {
      getLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
      transaction: vi.fn(),
    };

    expect(
      moveSingleLabel({
        engine,
        sample: SAMPLE,
        from: "frames.a",
        to: "frames.tags",
        docId: "doc",
        slotOf: (path) => (path === "frames.a" ? slotOf(path) : undefined),
        isFrameField,
        base,
      }),
    ).toBe("refused");
    expect(engine.transaction).not.toHaveBeenCalled();
  });

  it("leaves a move between sample fields to the caller", () => {
    const engine = {
      getLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
      transaction: vi.fn(),
    };

    expect(
      moveSingleLabel({
        engine,
        sample: SAMPLE,
        from: "a",
        to: "b",
        docId: "doc",
        slotOf,
        isFrameField,
        base,
      }),
    ).toBe("unhandled");
    expect(engine.transaction).not.toHaveBeenCalled();
  });
});
