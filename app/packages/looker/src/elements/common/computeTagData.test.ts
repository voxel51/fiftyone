import {
  COLOR_BY,
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  STRING_FIELD,
  type Schema,
} from "@fiftyone/utilities";
import { beforeAll, describe, expect, it } from "vitest";
import { computeLabelTagCounts, computeTagData } from "./computeTagData";

const DETECTIONS_SCHEMA: Schema = {
  filepath: {
    dbField: "filepath",
    description: null,
    embeddedDocType: null,
    fields: {},
    ftype: STRING_FIELD,
    info: null,
    name: "filepath",
    path: "filepath",
    subfield: null,
  },
  str_list: {
    dbField: "str_list",
    description: null,
    embeddedDocType: null,
    fields: {},
    ftype: LIST_FIELD,
    info: null,
    name: "str_list",
    path: "str_list",
    subfield: STRING_FIELD,
  },
  ground_truth: {
    dbField: "ground_truth",
    description: null,
    embeddedDocType: "fiftyone.core.labels.Detections",
    fields: {
      detections: {
        dbField: "detections",
        description: null,
        embeddedDocType: null,
        fields: {},
        ftype: LIST_FIELD,
        info: null,
        name: "detections",
        path: "ground_truth.detections",
        subfield: EMBEDDED_DOCUMENT_FIELD,
      },
    },
    ftype: EMBEDDED_DOCUMENT_FIELD,
    info: null,
    name: "ground_truth",
    path: "ground_truth",
    subfield: null,
  },
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
  overrides: Partial<Parameters<typeof computeTagData>[0]>
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
      })
    );

    expect(result.map((item) => item.value)).toEqual(["sample-tag", "keep: 2"]);
  });

  it("applies filter for primitive fields", () => {
    const result = computeTagData(
      makeInput({
        activePaths: ["filepath"],
        filter: () => false,
      })
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
});

describe("computeLabelTagCounts", () => {
  it("returns empty counts for samples with no label fields", () => {
    const schema: Schema = {
      filepath: {
        dbField: "filepath",
        description: null,
        embeddedDocType: null,
        fields: {},
        ftype: STRING_FIELD,
        info: null,
        name: "filepath",
        path: "filepath",
        subfield: null,
      },
    };
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
      predictions: {
        dbField: "predictions",
        description: null,
        embeddedDocType: "fiftyone.core.labels.Classification",
        fields: {},
        ftype: EMBEDDED_DOCUMENT_FIELD,
        info: null,
        name: "predictions",
        path: "predictions",
        subfield: null,
      },
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
      ground_truth: {
        dbField: "ground_truth",
        description: null,
        embeddedDocType: "fiftyone.core.labels.Detections",
        fields: {
          detections: {
            dbField: "detections",
            description: null,
            embeddedDocType: null,
            fields: {},
            ftype: LIST_FIELD,
            info: null,
            name: "detections",
            path: "ground_truth.detections",
            subfield: EMBEDDED_DOCUMENT_FIELD,
          },
        },
        ftype: EMBEDDED_DOCUMENT_FIELD,
        info: null,
        name: "ground_truth",
        path: "ground_truth",
        subfield: null,
      },
      predictions: {
        dbField: "predictions",
        description: null,
        embeddedDocType: "fiftyone.core.labels.Classification",
        fields: {},
        ftype: EMBEDDED_DOCUMENT_FIELD,
        info: null,
        name: "predictions",
        path: "predictions",
        subfield: null,
      },
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
      my_labels: {
        dbField: "my_labels_db",
        description: null,
        embeddedDocType: "fiftyone.core.labels.Classification",
        fields: {},
        ftype: EMBEDDED_DOCUMENT_FIELD,
        info: null,
        name: "my_labels",
        path: "my_labels",
        subfield: null,
      },
    };
    const sample = {
      my_labels_db: { tags: ["found"] },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({ found: 1 });
  });

  it("counts tags from Classifications (list of classifications)", () => {
    const schema: Schema = {
      classes: {
        dbField: "classes",
        description: null,
        embeddedDocType: "fiftyone.core.labels.Classifications",
        fields: {
          classifications: {
            dbField: "classifications",
            description: null,
            embeddedDocType: null,
            fields: {},
            ftype: LIST_FIELD,
            info: null,
            name: "classifications",
            path: "classes.classifications",
            subfield: EMBEDDED_DOCUMENT_FIELD,
          },
        },
        ftype: EMBEDDED_DOCUMENT_FIELD,
        info: null,
        name: "classes",
        path: "classes",
        subfield: null,
      },
    };
    const sample = {
      classes: {
        classifications: [
          { label: "scene", tags: ["auto"] },
          { label: "weather", tags: ["auto", "verified"] },
        ],
      },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      auto: 2,
      verified: 1,
    });
  });

  it("counts tags from first frame only for video samples", () => {
    const schema: Schema = {
      frames: {
        dbField: "frames",
        description: null,
        embeddedDocType: "fiftyone.core.frames.FrameSample",
        fields: {
          detections: {
            dbField: "detections",
            description: null,
            embeddedDocType: "fiftyone.core.labels.Detections",
            fields: {
              detections: {
                dbField: "detections",
                description: null,
                embeddedDocType: null,
                fields: {},
                ftype: LIST_FIELD,
                info: null,
                name: "detections",
                path: "frames.detections.detections",
                subfield: EMBEDDED_DOCUMENT_FIELD,
              },
            },
            ftype: EMBEDDED_DOCUMENT_FIELD,
            info: null,
            name: "detections",
            path: "frames.detections",
            subfield: null,
          },
        },
        ftype: LIST_FIELD,
        info: null,
        name: "frames",
        path: "frames",
        subfield: EMBEDDED_DOCUMENT_FIELD,
      },
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

  it("ignores non-label embedded document fields", () => {
    const schema: Schema = {
      metadata: {
        dbField: "metadata",
        description: null,
        embeddedDocType: "fiftyone.core.metadata.ImageMetadata",
        fields: {},
        ftype: EMBEDDED_DOCUMENT_FIELD,
        info: null,
        name: "metadata",
        path: "metadata",
        subfield: null,
      },
    };
    const sample = {
      metadata: { width: 100, height: 200, tags: ["should-not-count"] },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({});
  });

  it("handles Keypoints list label type", () => {
    const schema: Schema = {
      keypoints: {
        dbField: "keypoints",
        description: null,
        embeddedDocType: "fiftyone.core.labels.Keypoints",
        fields: {
          keypoints: {
            dbField: "keypoints",
            description: null,
            embeddedDocType: null,
            fields: {},
            ftype: LIST_FIELD,
            info: null,
            name: "keypoints",
            path: "keypoints.keypoints",
            subfield: EMBEDDED_DOCUMENT_FIELD,
          },
        },
        ftype: EMBEDDED_DOCUMENT_FIELD,
        info: null,
        name: "keypoints",
        path: "keypoints",
        subfield: null,
      },
    };
    const sample = {
      keypoints: {
        keypoints: [{ tags: ["pose"] }, { tags: ["pose", "occluded"] }],
      },
    };
    expect(computeLabelTagCounts(sample, schema)).toEqual({
      pose: 2,
      occluded: 1,
    });
  });
});
