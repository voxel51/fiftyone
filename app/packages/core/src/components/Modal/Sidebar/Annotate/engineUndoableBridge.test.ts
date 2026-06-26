import { AnnotationEngine, SampleLabelStore } from "@fiftyone/annotation";
import { CommandContext, DelegatingUndoable } from "@fiftyone/commands";
import type { Schema } from "@fiftyone/utilities";
import { Sample } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { bindEngineCommits, bindEngineDrops } from "./engineUndoableBridge";

const field = (
  embeddedDocType: string | null,
  fields?: Schema,
  extras: Record<string, unknown> = {},
) => ({
  dbField: null,
  description: null,
  embeddedDocType,
  ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  info: null,
  name: "",
  path: "",
  subfield: null,
  ...(fields ? { fields } : {}),
  ...extras,
});

const schema = {
  ground_truth: field("fiftyone.core.labels.Detections", {
    detections: field(null, undefined, {
      ftype: "fiftyone.core.fields.ListField",
      subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    }),
  }),
} as unknown as Schema;

const ref = (instanceId: string) => ({
  sample: "s1",
  path: "ground_truth",
  instanceId,
});

const makeWorld = () => {
  const engine = new AnnotationEngine();
  const sample = new Sample({
    data: {
      ground_truth: {
        detections: [{ _id: "d1", _cls: "Detection", label: "cat" }],
      },
    },
    schema,
  });
  engine.registerStore(new SampleLabelStore("s1", sample));

  const context = new CommandContext("test.annotate");
  bindEngineCommits({ engine, context });
  bindEngineDrops({ engine, context });

  return { engine, context };
};

describe("engine ↔ command-stack undoable bridge", () => {
  it("pushes a committed edit onto the command stack as one undoable", () => {
    const { engine, context } = makeWorld();

    engine.updateLabel(ref("d1"), { label: "dog" });

    expect(context.canUndo()).toBe(true);
    expect(context.describeUndoStack()).toHaveLength(1);
    expect(context.describeUndoStack()[0]).toContain("update");
  });

  it("undo applies the engine inverse; redo re-applies", async () => {
    const { engine, context } = makeWorld();

    engine.updateLabel(ref("d1"), { label: "dog" });

    await context.undo();
    expect(engine.getLabel(ref("d1"))?.label).toBe("cat");
    expect(context.canRedo()).toBe(true);

    await context.redo();
    expect(engine.getLabel(ref("d1"))?.label).toBe("dog");
  });

  it("a coalesced gesture stays one undoable (no per-commit push)", async () => {
    const { engine, context } = makeWorld();

    for (const confidence of [0.1, 0.5, 0.9]) {
      engine.transaction(() => engine.updateLabel(ref("d1"), { confidence }), {
        undoKey: "slider",
      });
    }

    expect(context.describeUndoStack()).toHaveLength(1);

    await context.undo();
    expect(engine.getLabel(ref("d1"))?.confidence).toBeUndefined();
    expect(context.canUndo()).toBe(false);
  });

  it("interleaves engine and non-engine actions in one ordered timeline", async () => {
    const { engine, context } = makeWorld();
    let flag = false;

    // an engine edit, then a non-destructive (non-engine) undoable
    engine.updateLabel(ref("d1"), { label: "dog" });
    flag = true;
    context.pushUndoable(
      new DelegatingUndoable(
        "non-engine",
        () => {
          flag = true;
        },
        () => {
          flag = false;
        },
      ),
    );

    // newest-first: the non-engine action reverses before the engine edit
    await context.undo();
    expect(flag).toBe(false);
    expect(engine.getLabel(ref("d1"))?.label).toBe("dog");

    await context.undo();
    expect(engine.getLabel(ref("d1"))?.label).toBe("cat");
  });

  it("prunes a rolled-back entry from the command stack", () => {
    const { engine, context } = makeWorld();

    engine.deleteLabel(ref("d1"));
    expect(context.canUndo()).toBe(true);

    engine.rollbackEntry(engine.lastUndoEntry()!);

    expect(engine.getLabel(ref("d1"))?.label).toBe("cat");
    expect(context.canUndo()).toBe(false);
  });
});
