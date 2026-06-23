/**
 * Shared engine test fixtures: a minimal label schema and store/engine
 * factories. Test-only — not exported from the engine barrel.
 */

import type { Field, LabelData, Schema } from "@fiftyone/utilities";
import { Sample } from "@fiftyone/utilities";

import { AnnotationEngine } from "../core/engine";
import type { UndoEntry } from "../core/undoStack";
import type { LabelRef } from "../identity/ref";
import { SampleLabelStore } from "../store/sampleLabelStore";

export const field = (
  embeddedDocType: string | null,
  fields?: Schema,
  extras: Partial<Field> = {}
): Field => ({
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

export const labelSchema: Schema = {
  ground_truth: field("fiftyone.core.labels.Detections", {
    detections: field(null, undefined, {
      ftype: "fiftyone.core.fields.ListField",
      subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    }),
  }),
  predictions: field("fiftyone.core.labels.Detections", {
    detections: field(null, undefined, {
      ftype: "fiftyone.core.fields.ListField",
      subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    }),
  }),
  classification: field("fiftyone.core.labels.Classification"),
  uuid: field(null, undefined, { ftype: "fiftyone.core.fields.StringField" }),
};

export const makeDet = (id: string, label: string): LabelData => ({
  _id: id,
  _cls: "Detection",
  label,
});

export const makeStore = (
  sampleId: string,
  data: Record<string, unknown> = {}
) => {
  const sample = new Sample({ data, schema: labelSchema });
  return { sample, store: new SampleLabelStore(sampleId, sample) };
};

/** An engine with one registered sample-level store. */
export const makeEngine = (
  sampleId = "sample-1",
  data: Record<string, unknown> = {}
) => {
  const engine = new AnnotationEngine();
  const { sample, store } = makeStore(sampleId, data);
  const unregister = engine.registerStore(store);
  return { engine, sample, store, unregister };
};

export const ref = (
  path: string,
  instanceId: string,
  sample = "sample-1"
): LabelRef => ({ sample, path, instanceId });

/**
 * A minimal LIFO navigator over the engine's commit/drop emissions, mirroring
 * the global command stack. Tests drive undo/redo through it instead of the
 * engine (the engine produces + applies entries; it no longer navigates).
 */
export const createUndoNavigator = (engine: AnnotationEngine) => {
  const undos: UndoEntry[] = [];
  const redos: UndoEntry[] = [];

  engine.subscribeUndoableCommit((entry, coalesced) => {
    if (coalesced) {
      return;
    }

    undos.push(entry);
    redos.length = 0;
  });

  engine.subscribeUndoableDrop((ids) => {
    const dropped = new Set(ids);
    const prune = (stack: UndoEntry[]) => {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (dropped.has(stack[i].id)) {
          stack.splice(i, 1);
        }
      }
    };

    prune(undos);
    prune(redos);
  });

  return {
    undo() {
      const entry = undos.pop();

      if (entry) {
        engine.applyUndo(entry);
        redos.push(entry);
      }
    },
    redo() {
      const entry = redos.pop();

      if (entry) {
        engine.applyRedo(entry);
        undos.push(entry);
      }
    },
    canUndo() {
      return undos.length > 0;
    },
    canRedo() {
      return redos.length > 0;
    },
  };
};
