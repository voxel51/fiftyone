import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelectorFamily } from "../../../../__mocks__/recoil";
import * as aggregations from "./aggregations";
import { State } from "./types";

describe("test aggregation path accumulation", () => {
  it("resolves grouped modal label paths", () => {
    const testModalSampleAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "ground_truth.detections.one",
    }));
    setMockAtoms({
      expandPath: (path) => `${path}.detections`,
      modalFilterFields: (path) => [
        path,
        `${path}.one`,
        `${path}.two`,
        `${path}.numeric`,
      ],
      isNumericField: (path) => path.endsWith(".numeric"),
      labelFields: ({ space }) =>
        space === State.SPACE.SAMPLE
          ? ["ground_truth", "predictions"]
          : ["frames.frames_ground_truth", "frames.frames_predictions"],
      groupId: "groupId",
    });
    expect(testModalSampleAggregationPaths()).toStrictEqual([
      "tags",
      "ground_truth.detections",
      "ground_truth.detections.one",
      "ground_truth.detections.two",
      "predictions.detections",
      "predictions.detections.one",
      "predictions.detections.two",
    ]);

    const testModalSampleNumericAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "ground_truth.detections.numeric",
    }));

    expect(testModalSampleNumericAggregationPaths()).toStrictEqual([
      "ground_truth.detections.numeric",
      "predictions.detections.numeric",
    ]);

    const testModalFrameAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "frames.frames_ground_truth.detections.one",
    }));

    expect(testModalFrameAggregationPaths()).toStrictEqual([
      "frames.frames_ground_truth.detections",
      "frames.frames_ground_truth.detections.one",
      "frames.frames_ground_truth.detections.two",
      "frames.frames_predictions.detections",
      "frames.frames_predictions.detections.one",
      "frames.frames_predictions.detections.two",
    ]);

    const testModalFrameNumericAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "frames.frames_ground_truth.detections.numeric",
    }));

    expect(testModalFrameNumericAggregationPaths()).toStrictEqual([
      "frames.frames_ground_truth.detections.numeric",
      "frames.frames_predictions.detections.numeric",
    ]);
  });

  it("falls back to an empty aggregation list when the query is skipped", () => {
    const testAggregations = <
      TestSelectorFamily<typeof aggregations.aggregations>
    >(<unknown>aggregations.aggregations({
      extended: false,
      modal: false,
      paths: ["ground_truth"],
    }));

    setMockAtoms({
      aggregationQuery: null,
      hasFilters: () => false,
    });

    expect(testAggregations()).toStrictEqual([]);
  });
});

describe("deriveAggregation", () => {
  const FLOAT = { ftype: "fiftyone.core.fields.FloatField" };
  const INT = { ftype: "fiftyone.core.fields.IntField" };
  const STRING = { ftype: "fiftyone.core.fields.StringField" };
  const OBJECT_ID = { ftype: "fiftyone.core.fields.ObjectIdField" };
  const BOOL = { ftype: "fiftyone.core.fields.BooleanField" };
  const EMB_DOC = {
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  };
  const LIST_STR = {
    ftype: "fiftyone.core.fields.ListField",
    subfield: "fiftyone.core.fields.StringField",
  };

  it("scalar Classification: count=1, derives label/confidence", () => {
    const sample = {
      alexnet: { label: "car", confidence: 0.42 },
    };
    expect(aggregations.deriveAggregation("alexnet", sample, EMB_DOC)).toEqual({
      __typename: "DataAggregation",
      path: "alexnet",
      count: 1,
    });
    expect(
      aggregations.deriveAggregation("alexnet.label", sample, STRING)
    ).toEqual({
      __typename: "StringAggregation",
      path: "alexnet.label",
      count: 1,
      exists: 1,
      values: [{ value: "car", count: 1 }],
    });
    expect(
      aggregations.deriveAggregation("alexnet.confidence", sample, FLOAT)
    ).toEqual({
      __typename: "FloatAggregation",
      path: "alexnet.confidence",
      count: 1,
      exists: 1,
      inf: 0,
      ninf: 0,
      nan: 0,
      min: 0.42,
      max: 0.42,
    });
  });

  it("list of embedded docs: count=list length; nested leaf agg traverses list", () => {
    const sample = {
      detections: {
        detections: [
          { label: "car", confidence: 0.8 },
          { label: "truck", confidence: 0.6 },
          { label: "car", confidence: 0.5 },
        ],
      },
    };
    expect(
      aggregations.deriveAggregation("detections.detections", sample, {
        ftype: "fiftyone.core.fields.ListField",
        subfield: "fiftyone.core.fields.EmbeddedDocumentField",
      })
    ).toEqual({
      __typename: "DataAggregation",
      path: "detections.detections",
      count: 3,
    });
    expect(
      aggregations.deriveAggregation(
        "detections.detections.label",
        sample,
        STRING
      )
    ).toEqual({
      __typename: "StringAggregation",
      path: "detections.detections.label",
      count: 3,
      exists: 3,
      values: [
        { value: "car", count: 2 },
        { value: "truck", count: 1 },
      ],
    });
    expect(
      aggregations.deriveAggregation(
        "detections.detections.confidence",
        sample,
        FLOAT
      )
    ).toMatchObject({
      __typename: "FloatAggregation",
      count: 3,
      min: 0.5,
      max: 0.8,
    });
  });

  it("ListField<StringField> like top-level tags", () => {
    expect(
      aggregations.deriveAggregation("tags", { tags: [] }, LIST_STR)
    ).toEqual({
      __typename: "StringAggregation",
      path: "tags",
      count: 0,
      exists: 0,
      values: [],
    });
    expect(
      aggregations.deriveAggregation(
        "tags",
        { tags: ["a", "b", "a"] },
        LIST_STR
      )
    ).toEqual({
      __typename: "StringAggregation",
      path: "tags",
      count: 3,
      exists: 3,
      values: [
        { value: "a", count: 2 },
        { value: "b", count: 1 },
      ],
    });
  });

  it("FloatAggregation: NaN/Inf/-Inf are counted separately and excluded from min/max", () => {
    const sample = {
      detections: {
        detections: [
          { score: 1.0 },
          { score: Number.NaN },
          { score: Number.POSITIVE_INFINITY },
          { score: Number.NEGATIVE_INFINITY },
          { score: 3.5 },
        ],
      },
    };
    expect(
      aggregations.deriveAggregation(
        "detections.detections.score",
        sample,
        FLOAT
      )
    ).toEqual({
      __typename: "FloatAggregation",
      path: "detections.detections.score",
      count: 5,
      exists: 5,
      inf: 1,
      ninf: 1,
      nan: 1,
      min: 1.0,
      max: 3.5,
    });
  });

  it("IntAggregation: tracks min/max across leaves", () => {
    const sample = {
      detections: {
        detections: [{ index: 0 }, { index: 5 }, { index: 2 }],
      },
    };
    expect(
      aggregations.deriveAggregation("detections.detections.index", sample, INT)
    ).toEqual({
      __typename: "IntAggregation",
      path: "detections.detections.index",
      count: 3,
      exists: 3,
      min: 0,
      max: 5,
    });
  });

  it("BooleanAggregation: counts true vs false", () => {
    const sample = {
      detections: {
        detections: [{ flag: true }, { flag: false }, { flag: true }],
      },
    };
    expect(
      aggregations.deriveAggregation("detections.detections.flag", sample, BOOL)
    ).toEqual({
      __typename: "BooleanAggregation",
      path: "detections.detections.flag",
      count: 3,
      exists: 3,
      true: 2,
      false: 1,
    });
  });

  it("ObjectIdField is aggregated as StringAggregation", () => {
    const sample = {
      detections: {
        detections: [{ _id: "abc" }, { _id: "def" }, { _id: "abc" }],
      },
    };
    expect(
      aggregations.deriveAggregation(
        "detections.detections._id",
        sample,
        OBJECT_ID
      )
    ).toMatchObject({
      __typename: "StringAggregation",
      count: 3,
      values: [
        { value: "abc", count: 2 },
        { value: "def", count: 1 },
      ],
    });
  });

  it("missing intermediate doc yields zero counts (not throwing)", () => {
    const sample = { other_field: "x" };
    expect(aggregations.deriveAggregation("alexnet", sample, EMB_DOC)).toEqual({
      __typename: "DataAggregation",
      path: "alexnet",
      count: 0,
    });
    expect(
      aggregations.deriveAggregation("alexnet.confidence", sample, FLOAT)
    ).toEqual({
      __typename: "FloatAggregation",
      path: "alexnet.confidence",
      count: 0,
      exists: 0,
      inf: 0,
      ninf: 0,
      nan: 0,
      min: null,
      max: null,
    });
  });

  it("null field info defaults to DataAggregation", () => {
    expect(
      aggregations.deriveAggregation("custom_field", { custom_field: 42 }, null)
    ).toEqual({
      __typename: "DataAggregation",
      path: "custom_field",
      count: 1,
    });
  });
});
