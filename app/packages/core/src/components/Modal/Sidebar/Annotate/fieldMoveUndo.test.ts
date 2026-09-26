/**
 * Regression (2026-09-23): a label's field move recorded two undo steps — the
 * command-stack undoable Field.tsx returns, plus the engine unit its
 * transaction committed — and every undo of the undoable recorded a fresh
 * engine unit. Undo ping-ponged between the fields (pose → face → pose took
 * six undos, alternating) and placements behind the move unwound only after
 * the extra steps.
 *
 * The models below mirror Field.tsx's move: the same engine calls inside a
 * `record: false` transaction, owned by one DelegatingUndoable. If Field.tsx
 * changes that shape, change the models with it.
 */
import { AnnotationEngine, SampleLabelStore } from "@fiftyone/annotation";
import { CommandContext, DelegatingUndoable } from "@fiftyone/commands";
import type { Schema } from "@fiftyone/utilities";
import { Sample } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { bindEngineCommits, bindEngineDrops } from "./engineUndoableBridge";

const detectionsField = () => ({
  dbField: null,
  description: null,
  embeddedDocType: "fiftyone.core.labels.Detections",
  ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  info: null,
  name: "",
  path: "",
  subfield: null,
  fields: {
    detections: {
      dbField: null,
      description: null,
      embeddedDocType: null,
      ftype: "fiftyone.core.fields.ListField",
      info: null,
      name: "",
      path: "",
      subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    },
  },
});

// two fields standing in for the `pose` and `face` keypoint fields
const schema = {
  pose: detectionsField(),
  face: detectionsField(),
} as unknown as Schema;

type FieldName = "pose" | "face";

const ref = (path: FieldName) => ({ sample: "s1", path, instanceId: "d1" });

const makeWorld = (data: Record<string, unknown>) => {
  const engine = new AnnotationEngine();
  engine.registerStore(
    new SampleLabelStore("s1", new Sample({ data, schema })),
  );

  const context = new CommandContext("test.annotate");
  bindEngineCommits({ engine, context });
  bindEngineDrops({ engine, context });

  return { engine, context };
};

const withLabelOnPose = () =>
  makeWorld({
    pose: { detections: [{ _id: "d1", _cls: "Detection", label: "p" }] },
  });

/** Which field the label currently lives on. */
const where = (engine: AnnotationEngine): FieldName | "none" => {
  if (engine.getLabel(ref("pose"))) return "pose";
  if (engine.getLabel(ref("face"))) return "face";
  return "none";
};

/** Field.tsx's move, without the keypoint erase. */
const fieldMove = (
  engine: AnnotationEngine,
  from: FieldName,
  to: FieldName,
) => {
  const move = (a: FieldName, b: FieldName) =>
    engine.transaction(
      () => {
        const data = engine.getLabel(ref(a));
        if (!data) return;
        engine.deleteLabel(ref(a));
        engine.updateLabel(ref(b), { ...data });
      },
      { record: false },
    );

  return new DelegatingUndoable(
    "update-d1-field-action",
    () => move(from, to),
    () => move(to, from),
  );
};

/** Undo until the stack is empty (capped), recording `read()` after each. */
const undoAll = async (context: CommandContext, read: () => string) => {
  const seen: string[] = [];
  for (let i = 0; i < 12 && context.canUndo(); i++) {
    await context.undo();
    seen.push(read());
  }
  return seen;
};

describe("field move undo", () => {
  it("records one undo step", async () => {
    const { engine, context } = withLabelOnPose();

    await context.executeAction(fieldMove(engine, "pose", "face"));

    expect(context.describeUndoStack()).toHaveLength(1);
  });

  it("undo restores the source field and leaves redo available", async () => {
    const { engine, context } = withLabelOnPose();

    await context.executeAction(fieldMove(engine, "pose", "face"));
    await context.undo();

    expect(where(engine)).toBe("pose");
    expect(context.canUndo()).toBe(false);
    expect(context.canRedo()).toBe(true);

    await context.redo();
    expect(where(engine)).toBe("face");
  });

  it("pose → face → pose, undo all: face, then pose, then done", async () => {
    const { engine, context } = withLabelOnPose();

    await context.executeAction(fieldMove(engine, "pose", "face"));
    await context.executeAction(fieldMove(engine, "face", "pose"));

    expect(await undoAll(context, () => where(engine))).toEqual([
      "face",
      "pose",
    ]);
  });

  it("placements behind a keypoint move round trip unwind in order", async () => {
    const { engine, context } = makeWorld({});
    const H = [NaN, NaN];
    const P = [0.5, 0.5];
    const nodes: Record<FieldName, number> = { face: 3, pose: 2 };

    // three placements on face, one engine unit each (the first creates)
    for (const points of [
      [P, H, H],
      [P, P, H],
      [P, P, P],
    ]) {
      engine.updateLabel(ref("face"), {
        _cls: "Detection",
        label: "x",
        points,
      });
    }

    // Field.tsx's keypoint move: forward erases to the destination's holes
    // and captures the original; the reverse restores the capture
    const keypointMove = (from: FieldName, to: FieldName) => {
      let captured: object | undefined;
      const move = (a: FieldName, b: FieldName, forward: boolean) =>
        engine.transaction(
          () => {
            const data = engine.getLabel(ref(a));
            if (!data) return;
            engine.deleteLabel(ref(a));
            if (forward) {
              captured = data;
              engine.updateLabel(ref(b), {
                ...data,
                points: Array.from({ length: nodes[b] }, () => H),
              });
            } else {
              engine.updateLabel(ref(b), { ...(captured ?? data) });
            }
          },
          { record: false },
        );
      return new DelegatingUndoable(
        "update-d1-field-action",
        () => move(from, to, true),
        () => move(to, from, false),
      );
    };

    await context.executeAction(keypointMove("face", "pose"));
    await context.executeAction(keypointMove("pose", "face"));

    const placed = () => {
      const field = where(engine);
      if (field === "none") return "none";
      const { points } = engine.getLabel(ref(field)) as { points?: number[][] };
      const count = (points ?? []).filter((p) => Number.isFinite(p[0])).length;
      return `${field}:${count}`;
    };

    expect(await undoAll(context, placed)).toEqual([
      "pose:0",
      "face:3",
      "face:2",
      "face:1",
      "none",
    ]);
  });
});
