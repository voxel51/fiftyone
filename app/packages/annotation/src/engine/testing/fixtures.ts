/**
 * Shared engine test fixtures: a minimal label schema and store/engine
 * factories. Test-only — not exported from the engine barrel.
 */

import type { Field, LabelData, Schema } from "@fiftyone/utilities";
import { Sample } from "@fiftyone/utilities";

import { AnnotationEngine } from "../core/engine";
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
