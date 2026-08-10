import {
  COLOR_BY,
  EMBEDDED_DOCUMENT_FIELD,
  type Field,
  LIST_FIELD,
  STRING_FIELD,
  type Schema,
} from "@fiftyone/utilities";
import { beforeAll, describe, expect, it } from "vitest";
import { computeLabelTagCounts, computeTagData } from "./computeTagData";

const makeField = (name: string, overrides: Partial<Field> = {}): Field => ({
  dbField: name,
  description: null,
  embeddedDocType: null,
  fields: {},
  ftype: STRING_FIELD,
  info: null,
  name,
  path: name,
  subfield: null,
  ...overrides,
});

const DETECTIONS_SCHEMA: Schema = {
  filepath: makeField("filepath"),
  str_list: makeField("str_list", {
    ftype: LIST_FIELD,
    subfield: STRING_FIELD,
  }),
  ground_truth: makeField("ground_truth", {
    embeddedDocType: "fiftyone.core.labels.Detections",
    ftype: EMBEDDED_DOCUMENT_FIELD,
    fields: {
      detections: makeField("detections", {
        ftype: LIST_FIELD,
        path: "ground_truth.detections",
        subfield: EMBEDDED_DOCUMENT_FIELD,
      }),
    },
  }),
};

const COLORING = {
  by: COLOR_BY.FIELD,
  defaultMaskTargetsColors: [],
  maskTargets: {},
  points: false,
  pool: ["#00ff00", "#ff0000", "#0000ff"],
  scale: [],
  seed: 7,
  targets: [],
};

const makeInput = (
  overrides: Partial<Parameters<typeof computeTagData>[0]>,
) => ({
  activePaths: [],
  attributeVisibility: {},
  coloring: COLORING,
  customizeColorSetting: [],
  fieldSchema: DETECTIONS_SCHEMA,
  filter: () => true,
  labelTagColors: {},
  sample: {
    filepath: "/tmp/sample-1.png",
    str_list: ["a", "b", "c", "d"],
    tags: ["sample-tag"],
    ground_truth: {
      _cls: "Detections",
      detections: [
        { _cls: "Detection", label: "cat", tags: ["keep", "skip"] },
        { _cls: "Detection", label: "dog", tags: ["keep"] },
      ],
    },
  },
  selectedLabelTags: undefined,
  timeZone: "UTC",
  ...overrides,
});

describe("computeTagData", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { supports: (_prop: string, color?: string) => Boolean(color) },
    });
  });

  it("renders primitive bubbles for filepath", () => {
    const result = computeTagData(makeInput({ activePaths: ["filepath"] }));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "filepath",
      value: "/tmp/sample-1.png",
      title: "filepath: /tmp/sample-1.png",
    });
  });

  it("renders tags and applies _label_tags visibility", () => {
    const result = computeTagData(
      makeInput({
        activePaths: ["tags", "_label_tags"],
        attributeVisibility: {
          _label_tags: {
            values: ["keep"],
            exclude: false,
          },
        },
      }),
    );

    expect(result.map((item) => item.value)).toEqual(["sample-tag", "keep: 2"]);
  });

  it("applies filter for primitive fields", () => {
    const result = computeTagData(
      makeInput({
        activePaths: ["filepath"],
        filter: () => false,
      }),
    );

    expect(result).toEqual([]);
  });

  it("truncates primitive list values after three items", () => {
    const result = computeTagData(makeInput({ activePaths: ["str_list"] }));

    expect(result.map((item) => item.value)).toEqual([
      "a",
      "b",
      "c",
      "and 1 more",
    ]);
  });

  describe("showPatchLabels", () => {
    it("renders labels for spatial label list fields when enabled", () => {
      const result = computeTagData(
        makeInput({ activePaths: ["ground_truth"], showPatchLabels: true }),
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        path: "ground_truth",
        value: "cat",
        title: "ground_truth: cat",
      });
      expect(result[1]).toMatchObject({ value: "dog" });
    });

    it("renders nothing for spatial label fields when disabled", () => {
      const result = computeTagData(
        makeInput({ activePaths: ["ground_truth"] }),
      );

      expect(result).toEqual([]);
    });

    it("skips spatial labels without a label value", () => {
      const result = computeTagData(
        makeInput({
          activePaths: ["ground_truth"],
          sample: {
            ground_truth: {
              _cls: "Detections",
              detections: [
                { _cls: "Detection" },
                { _cls: "Detection", label: "dog" },
              ],
            },
          },
          showPatchLabels: true,
        }),
      );

      expect(result.map((item) => item.value)).toEqual(["dog"]);
    });

    it("truncates spatial labels after three items", () => {
      const result = computeTagData(
        makeInput({
          activePaths: ["ground_truth"],
          sample: {
            ground_truth: {
              _cls: "Detections",
              detections: ["a", "b", "c", "d", "e"].map((label) => ({
                _cls: "Detection",
                label,
              })),
            },
          },
          showPatchLabels: true,
        }),
      );

      expect(result.map((item) => item.value)).toEqual([
        "a",
        "b",
        "c",
        "and 2 more",
      ]);
    });

    it("renders configured attributes comma separated", () => {
      const result = computeTagData(
        makeInput({
          activePaths: ["ground_truth"],
          sample: {
            ground_truth: {
              _cls: "Detections",
              detections: [
                { _cls: "Detection", label: "cat", confidence: 0.95 },
              ],
            },
          },
          showPatchLabels: true,
          shownLabelAttributes: { ground_truth: ["label", "confidence"] },
        }),
      );

      expect(result.map((item) => item.value)).toEqual(["cat, 0.95"]);
    });

    it("renders labels for polylines fields", () => {
      const schema: Schema = {
        polylines: makeField("polylines", {
          embeddedDocType: "fiftyone.core.labels.Polylines",
          ftype: EMBEDDED_DOCUMENT_FIELD,
          fields: {
            polylines: makeField("polylines", {
              ftype: LIST_FIELD,
              path: "polylines.polylines",
              subfield: EMBEDDED_DOCUMENT_FIELD,
            }),
          },
        }),
      };
      const result = computeTagData(
        makeInput({
          activePaths: ["polylines"],
          fieldSchema: schema,
          sample: {
            polylines: {
              _cls: "Polylines",
              polylines: [{ _cls: "Polyline", label: "lane" }],
            },
          },
          showPatchLabels: true,
        }),
      );

      expect(result.map((item) => item.value)).toEqual(["lane"]);
    });
  });

  describe("shownLabelAttributes for classifications", () => {
    const schema: Schema = {
      predictions: makeField("predictions", {
        embeddedDocType: "fiftyone.core.labels.Classification",
        ftype: EMBEDDED_DOCUMENT_FIELD,
      }),
    };
    const sample = {
      predictions: {
        _cls: "Classification",
        label: "cat",
        confidence: 0.5,
      },
    };

    it("renders the label attribute without a setting", () => {
      const result = computeTagData(
        makeInput({
          activePaths: ["predictions"],
          fieldSchema: schema,
          sample,
        }),
      );

      expect(result.map((item) => item.value)).toEqual(["cat"]);
    });

    it("renders configured attributes comma separated", () => {
      const result = computeTagData(
        makeInput({
          activePaths: ["predictions"],
          fieldSchema: schema,
          sample,
          shownLabelAttributes: { predictions: ["label", "confidence"] },
        }),
      );

      expect(result.map((item) => item.value)).toEqual(["cat, 0.5"]);
    });

    it("falls back to null when configured attributes are missing", () => {
      const result = computeTagData(
        makeInput({
          activePaths: ["predictions"],
          fieldSchema: schema,
          sample,
          shownLabelAttributes: { predictions: ["missing"] },
        }),
      );

      expect(result.map((item) => item.value)).toEqual(["null"]);
    });
  });
});

describe("computeLabelTagCounts", () => {
  it("returns empty counts for samples with no label fields", () => {
    const schema: Schema = { filepath: makeField("filepath") };
    const sample = { filepath: "/tmp/img.png", tags: [] };
    expect(computeLabelTagCounts(sample, schema)).toEqual({});
  });

  it("counts tags from a Detections (list) label field", () => {
    const sample = {
      ground_truth: {
        _cls: "Detections",
        detections: [
          { _cls: "Detection", label: "cat", tags: ["verified", "reviewed"] },
          { _cls: "Detection", label: "dog", tags: ["verified"] },
          { _cls: "Detection", label: "bird", tags: [] },
        ],
      },
    };
    expect(computeLabelTagCounts(sample, DETECTIONS_SCHEMA)).toEqual({
      verified: 2,
      reviewed: 1,
    });
  });

  it("counts tags from a single Classification label field", () => {
    const schema: Schema = {
      predictions: makeField("predictions", {
        embeddedDocType: "fiftyone.core.labels.Classification",
        ftype: EMBEDDED_DOCUMENT_FIELD,
      }),
    };
    const sample = {
      predictions: {
        _cls: "Classification",
        label: "cat",
        tags: ["confident", "confident", "review"],
      },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      confident: 2,
      review: 1,
    });
  });

  it("accumulates tags across multiple label fields", () => {
    const schema: Schema = {
      ground_truth: makeField("ground_truth", {
        embeddedDocType: "fiftyone.core.labels.Detections",
        ftype: EMBEDDED_DOCUMENT_FIELD,
        fields: {
          detections: makeField("detections", {
            ftype: LIST_FIELD,
            path: "ground_truth.detections",
            subfield: EMBEDDED_DOCUMENT_FIELD,
          }),
        },
      }),
      predictions: makeField("predictions", {
        embeddedDocType: "fiftyone.core.labels.Classification",
        ftype: EMBEDDED_DOCUMENT_FIELD,
      }),
    };
    const sample = {
      ground_truth: {
        detections: [{ tags: ["shared", "gt-only"] }],
      },
      predictions: { tags: ["shared", "pred-only"] },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      shared: 2,
      "gt-only": 1,
      "pred-only": 1,
    });
  });

  it("handles null/missing label field values gracefully", () => {
    const sample = {
      ground_truth: null,
    };
    expect(computeLabelTagCounts(sample, DETECTIONS_SCHEMA)).toEqual({});
  });

  it("handles labels with missing tags gracefully", () => {
    const sample = {
      ground_truth: {
        detections: [{ label: "cat" }, { label: "dog", tags: ["tagged"] }],
      },
    };
    expect(computeLabelTagCounts(sample, DETECTIONS_SCHEMA)).toEqual({
      tagged: 1,
    });
  });

  it("uses dbField to access data when it differs from schema key", () => {
    const schema: Schema = {
      my_labels: makeField("my_labels", {
        dbField: "my_labels_db",
        embeddedDocType: "fiftyone.core.labels.Classification",
        ftype: EMBEDDED_DOCUMENT_FIELD,
      }),
    };
    const sample = {
      my_labels_db: { tags: ["found"] },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({ found: 1 });
  });

  it("counts tags from first frame only for video samples", () => {
    const schema: Schema = {
      frames: makeField("frames", {
        embeddedDocType: "fiftyone.core.frames.FrameSample",
        ftype: LIST_FIELD,
        subfield: EMBEDDED_DOCUMENT_FIELD,
        fields: {
          detections: makeField("detections", {
            embeddedDocType: "fiftyone.core.labels.Detections",
            ftype: EMBEDDED_DOCUMENT_FIELD,
            path: "frames.detections",
            fields: {
              detections: makeField("detections", {
                ftype: LIST_FIELD,
                path: "frames.detections.detections",
                subfield: EMBEDDED_DOCUMENT_FIELD,
              }),
            },
          }),
        },
      }),
    };
    const sample = {
      frames: [
        {
          detections: {
            detections: [
              { tags: ["frame1-tag"] },
              { tags: ["frame1-tag", "shared"] },
            ],
          },
        },
        {
          detections: {
            detections: [{ tags: ["frame2-tag-should-not-count"] }],
          },
        },
      ],
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      "frame1-tag": 2,
      shared: 1,
    });
  });

  it("counts tags from labels nested inside embedded documents", () => {
    const schema: Schema = {
      embedded: makeField("embedded", {
        embeddedDocType:
          "fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument",
        ftype: EMBEDDED_DOCUMENT_FIELD,
        fields: {
          detections: makeField("detections", {
            embeddedDocType: "fiftyone.core.labels.Detections",
            ftype: EMBEDDED_DOCUMENT_FIELD,
            path: "embedded.detections",
            fields: {
              detections: makeField("detections", {
                ftype: LIST_FIELD,
                path: "embedded.detections.detections",
                subfield: EMBEDDED_DOCUMENT_FIELD,
              }),
            },
          }),
        },
      }),
    };
    const sample = {
      embedded: {
        detections: {
          detections: [
            { _cls: "Detection", label: "cat", tags: ["hello"] },
            { _cls: "Detection", label: "dog", tags: ["hello", "world"] },
          ],
        },
      },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      hello: 2,
      world: 1,
    });
  });

  it("counts tags from labels nested inside embedded documents in video frames", () => {
    const schema: Schema = {
      frames: makeField("frames", {
        embeddedDocType: "fiftyone.core.frames.FrameSample",
        ftype: LIST_FIELD,
        subfield: EMBEDDED_DOCUMENT_FIELD,
        fields: {
          embedded: makeField("embedded", {
            embeddedDocType:
              "fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument",
            ftype: EMBEDDED_DOCUMENT_FIELD,
            path: "frames.embedded",
            fields: {
              detections: makeField("detections", {
                embeddedDocType: "fiftyone.core.labels.Detections",
                ftype: EMBEDDED_DOCUMENT_FIELD,
                path: "frames.embedded.detections",
                fields: {
                  detections: makeField("detections", {
                    ftype: LIST_FIELD,
                    path: "frames.embedded.detections.detections",
                    subfield: EMBEDDED_DOCUMENT_FIELD,
                  }),
                },
              }),
            },
          }),
        },
      }),
    };
    const sample = {
      frames: [
        {
          embedded: {
            detections: {
              detections: [{ _cls: "Detection", tags: ["hello"] }],
            },
          },
        },
      ],
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      hello: 1,
    });
  });

  it("counts tags from labels inside a list of embedded documents", () => {
    const schema: Schema = {
      items: makeField("items", {
        ftype: LIST_FIELD,
        subfield: EMBEDDED_DOCUMENT_FIELD,
        embeddedDocType:
          "fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument",
        fields: {
          detections: makeField("detections", {
            embeddedDocType: "fiftyone.core.labels.Detections",
            ftype: EMBEDDED_DOCUMENT_FIELD,
            path: "items.detections",
            fields: {
              detections: makeField("detections", {
                ftype: LIST_FIELD,
                path: "items.detections.detections",
                subfield: EMBEDDED_DOCUMENT_FIELD,
              }),
            },
          }),
        },
      }),
    };
    const sample = {
      items: [
        {
          detections: {
            detections: [{ tags: ["a", "b"] }],
          },
        },
        {
          detections: {
            detections: [{ tags: ["b", "c"] }],
          },
        },
      ],
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      a: 1,
      b: 2,
      c: 1,
    });
  });

  it("ignores non-label embedded document fields", () => {
    const schema: Schema = {
      metadata: makeField("metadata", {
        embeddedDocType: "fiftyone.core.metadata.ImageMetadata",
        ftype: EMBEDDED_DOCUMENT_FIELD,
      }),
    };
    const sample = {
      metadata: { width: 100, height: 200, tags: ["should-not-count"] },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({});
  });
});
