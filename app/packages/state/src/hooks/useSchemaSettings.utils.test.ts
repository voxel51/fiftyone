import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disabledField,
  getPath,
  getSubPaths,
  skipField,
} from "./useSchemaSettings.utils";
import {
  ARRAY_FIELD,
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_DISABLED_SUB_PATHS,
  DETECTION_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_FIELD,
  INT_FIELD,
  POLYLINE_DISABLED_SUB_PATHS,
  KEYPOINT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
  REGRESSION_FIELD,
  SEGMENTATION_FIELD,
  STRING_FIELD,
  TEMPORAL_DETECTIONS_FIELD,
  TEMPORAL_DETECTION_FIELD,
  CLASSIFICATION_DISABLED_SUB_PATHS,
  REGRESSION_DISABLED_SUB_PATHS,
  KEYPOINT_DISABLED_SUB_PATHS,
  SEGMENTATION_DISABLED_SUB_PATHS,
  HEATMAP_DISABLED_SUB_PATHS,
  TEMPORAL_DETECTION_DISABLED_SUB_PATHS,
  GEOLOCATION_DISABLED_SUB_PATHS,
  GEOLOCATIONS_DISABLED_SUB_PATHS,
  KEYPOINTS_FIELD,
  VECTOR_FIELD,
  FRAME_SUPPORT_FIELD,
} from "@fiftyone/utilities";

const BASE_FIELD = {
  path: null,
  embeddedDocType: null,
  ftype: null,
  description: null,
  info: null,
  name: null,
  fields: null,
  dbField: null,
  subfield: null,
  visible: false,
};

const GROUP_DATASET = "group";
const NOT_GROUP_DATASET = "";
const NON_EXISTENT_PATH = "non-existent-path";

export const FIELDS = {
  ID_FIELD: {
    ...BASE_FIELD,
    path: "id",
    ftype: OBJECT_ID_FIELD,
  },
  FILEPATH_FIELD: {
    ...BASE_FIELD,
    path: "filepath",
    ftype: STRING_FIELD,
  },
  TAGS_FIELD: {
    ...BASE_FIELD,
    path: "tags",
    ftype: LIST_FIELD,
  },
  CUSTOM_LIST_FIELD: {
    ...BASE_FIELD,
    path: "custom_list",
    ftype: LIST_FIELD,
  },
  METADATA_FIELD: {
    ...BASE_FIELD,
    path: "metadata",
    ftype: EMBEDDED_DOCUMENT_FIELD,
  },
  OBJECT_ID_TYPE: {
    ...BASE_FIELD,
    path: "id",
    ftype: OBJECT_ID_FIELD,
  },
  OBJECT_ID_TYPE_NESTED: {
    ...BASE_FIELD,
    path: "Nested.ObjectIdType",
    ftype: OBJECT_ID_FIELD,
  },
  FRAME_NUMBER_TYPE: {
    ...BASE_FIELD,
    path: "frame_number",
    ftype: FRAME_NUMBER_FIELD,
  },
  FRAME_NUMBER_CUSTOM_FIELD_TYPE: {
    ...BASE_FIELD,
    path: "frame_number_custom_name",
    ftype: FRAME_NUMBER_FIELD,
  },
  FRAME_SUPPORT_TYPE: {
    ...BASE_FIELD,
    path: "FrameSupportField",
    ftype: FRAME_SUPPORT_FIELD,
  },
  VECTOR_TYPE: {
    ...BASE_FIELD,
    path: "VectorField",
    ftype: VECTOR_FIELD,
  },
  CUSTOM_EMBEDDED_DOCUMENT_FIELD: {
    ...BASE_FIELD,
    path: "customEmbeddedDocumentField",
    ftype: EMBEDDED_DOCUMENT_FIELD,
  },
  CUSTOM_EMBEDDED_DOCUMENT_NAME_FIELD: {
    ...BASE_FIELD,
    path: "customEmbeddedDocumentField.name",
    ftype: STRING_FIELD,
  },
  GROUP_FIELD: {
    ...BASE_FIELD,
    path: GROUP_DATASET,
    ftype: EMBEDDED_DOCUMENT_FIELD,
  },
  GROUP_CHILD_FIELD: {
    ...BASE_FIELD,
    path: `${GROUP_DATASET}.name`,
    ftype: STRING_FIELD,
  },
  FRAME_ID_FIELD: {
    ...BASE_FIELD,
    path: "frames.id",
    ftype: OBJECT_ID_FIELD,
  },
  FRAMES_NUMBER_FIELD: {
    ...BASE_FIELD,
    path: "frames.frame_number",
    ftype: FRAME_NUMBER_FIELD,
  },
  SAMPLE_ID_FIELD: {
    ...BASE_FIELD,
    path: "sample_id",
    ftype: OBJECT_ID_FIELD,
  },
  FRAME_SAMPLE_ID_FIELD: {
    ...BASE_FIELD,
    path: "frames.sample_id",
    ftype: OBJECT_ID_FIELD,
  },
  FRAME_NUMBER_FIELD: {
    ...BASE_FIELD,
    path: "frame_number",
    ftype: INT_FIELD,
  },
  METADATA_WIDTH_FIELD: {
    ...BASE_FIELD,
    path: "metadata.width",
    ftype: FLOAT_FIELD,
  },
  DETECTION_FIELD: {
    ...BASE_FIELD,
    path: "detection",
    ftype: DETECTION_FIELD,
  },
  DETECTIONS_FIELD: {
    ...BASE_FIELD,
    path: "detections",
    ftype: DETECTIONS_FIELD,
    embeddedDocType: DETECTION_FIELD,
  },
  // skip path
  DETECTIONS_INDEX_FIELD: {
    ...BASE_FIELD,
    path: "detections.index",
    ftype: INT_FIELD,
  },
  // skip path
  DETECTIONS_BOUNDINGBOX_FIELD: {
    ...BASE_FIELD,
    path: "detections.bounding_box",
    ftype: LIST_FIELD,
  },
  DETECTIONS_LIST_FIELD: {
    ...BASE_FIELD,
    path: "detections",
    ftype: LIST_FIELD,
    embeddedDocType: DETECTIONS_FIELD,
  },
  // not a skip path
  DETECTIONS_NO_SKIP_FIELD: {
    ...BASE_FIELD,
    path: "detections.no_skip",
    ftype: LIST_FIELD,
  },
  CLASSIFICATION_FIELD: {
    ...BASE_FIELD,
    path: "classification",
    ftype: CLASSIFICATION_FIELD,
  },
  CLASSIFICATIONS_FIELD: {
    ...BASE_FIELD,
    path: "classifications",
    ftype: CLASSIFICATIONS_FIELD,
  },
  KEYPOINT_FIELD: {
    ...BASE_FIELD,
    path: "keypoint",
    ftype: KEYPOINT_FIELD,
  },
  KEYPOINTS_FIELD: {
    ...BASE_FIELD,
    path: "keypoints",
    ftype: KEYPOINTS_FIELD,
  },
  REGRESSION_FIELD: {
    ...BASE_FIELD,
    path: "regression",
    ftype: REGRESSION_FIELD,
  },
  HEATMAP_FIELD: {
    ...BASE_FIELD,
    path: "heatmap",
    ftype: HEATMAP_FIELD,
  },
  SEGMENTATION_FIELD: {
    ...BASE_FIELD,
    path: "segmentation",
    ftype: SEGMENTATION_FIELD,
  },
  GEO_LOCATION_FIELD: {
    ...BASE_FIELD,
    path: "geolocation",
    ftype: GEO_LOCATION_FIELD,
  },
  GEO_LOCATIONS_FIELD: {
    ...BASE_FIELD,
    path: "geolocations",
    ftype: GEO_LOCATIONS_FIELD,
  },
  POLYLINE_FIELD: {
    ...BASE_FIELD,
    path: "polyline",
    ftype: POLYLINE_FIELD,
  },
  POLYLINES_FIELD: {
    ...BASE_FIELD,
    path: "polylines",
    ftype: POLYLINES_FIELD,
  },
  TEMPORAL_DETECTION_FIELD: {
    ...BASE_FIELD,
    path: "temporal",
    ftype: TEMPORAL_DETECTION_FIELD,
  },
  TEMPORAL_DETECTION_FRAME_SUPPORT: {
    ...BASE_FIELD,
    path: "temporal.support",
    ftype: FRAME_SUPPORT_FIELD,
  },
  TEMPORAL_DETECTIONS_FIELD: {
    ...BASE_FIELD,
    path: "temporals",
    ftype: TEMPORAL_DETECTIONS_FIELD,
  },
};

const ORIGINAL_SCHEMA = {};
Object.values(FIELDS).forEach((f) => {
  ORIGINAL_SCHEMA[f.path] = f;
});
let SCHEMA = { ...ORIGINAL_SCHEMA };

const getDisabledNestedLabelFields = (prefix: string, paths: string[]) => {
  const res = [];
  if (paths.includes("id")) {
    res.push({ ...BASE_FIELD, path: `${prefix}.id`, ftype: OBJECT_ID_FIELD });
  }
  if (paths.includes("tags")) {
    res.push({ ...BASE_FIELD, path: `${prefix}.tags`, ftype: LIST_FIELD });
  }
  if (paths.includes("label")) {
    res.push({ ...BASE_FIELD, path: `${prefix}.label`, ftype: STRING_FIELD });
  }
  if (paths.includes("bounding_box")) {
    res.push({
      ...BASE_FIELD,
      path: `${prefix}.bounding_box`,
      ftype: LIST_FIELD,
    });
  }
  if (paths.includes("mask")) {
    res.push({ ...BASE_FIELD, path: `${prefix}.mask`, ftype: ARRAY_FIELD });
  }
  if (paths.includes("confidence")) {
    res.push({
      ...BASE_FIELD,
      path: `${prefix}.confidence`,
      ftype: FLOAT_FIELD,
    });
  }
  if (paths.includes("index")) {
    res.push({ ...BASE_FIELD, path: `${prefix}.index`, ftype: INT_FIELD });
  }
  if (paths.includes("support")) {
    res.push({
      ...BASE_FIELD,
      path: `${prefix}.support`,
      ftype: FRAME_SUPPORT_FIELD,
    });
  }

  return res;
};

const getEnabledNestedLabelFields = (prefix: string, paths: string[]) => {
  const res = [];
  for (let i = 0; i < paths.length; i++) {
    res.push({
      ...BASE_FIELD,
      path: `${prefix}.${paths[i]}`,
      ftype: STRING_FIELD,
    });
  }
  return res;
};

describe(`
  should skip '.index' and '.bounding_box' subpaths if
  the field's parent's embeddedDocumentType is Detections
`, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skip Detections's subpath ending with .index", () => {
    expect(skipField(FIELDS.DETECTIONS_INDEX_FIELD.path, SCHEMA)).toBe(true);
  });

  it("skip Detections's subpath ending with .bounding_box", () => {
    expect(skipField(FIELDS.DETECTIONS_BOUNDINGBOX_FIELD.path, SCHEMA)).toBe(
      true
    );
  });

  it("Do not skip regular path under Detections embeddedDocument type", () => {
    expect(skipField(FIELDS.DETECTIONS_NO_SKIP_FIELD.path, SCHEMA)).toBe(false);
  });

  it("A skipped path 'index' prefixed with 'frames.' should still be skipped", () => {
    expect(
      skipField(`frames.${FIELDS.DETECTIONS_INDEX_FIELD.path}`, SCHEMA)
    ).toBe(true);
  });

  it("passing empty path should throw an error", () => {
    expect(() => {
      skipField("", SCHEMA);
    }).toThrow("path argument is required");
  });

  it("should skip if the path is not in the schema", () => {
    expect(skipField("not_in_schema", SCHEMA)).toBe(true);
  });
});

describe("Disabled field paths in schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("id path is disabled across all fields", () => {
    expect(disabledField("id", SCHEMA, NOT_GROUP_DATASET)).toBe(true);
  });

  it("filepath path is disabled across all fields", () => {
    expect(disabledField(FIELDS.FILEPATH_FIELD.path, SCHEMA)).toBe(true);
  });

  it("tags path is disabled across all fields", () => {
    expect(disabledField(FIELDS.TAGS_FIELD.path, SCHEMA)).toBe(true);
  });

  it("metadata path is disabled across all fields", () => {
    expect(disabledField(FIELDS.METADATA_FIELD.path, SCHEMA)).toBe(true);
  });
});

describe("Disabled field types in schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("A field with ObjectIdField type and top-level 'id' path is disabled", () => {
    expect(disabledField(FIELDS.OBJECT_ID_TYPE.path, SCHEMA)).toBe(true);
  });

  it("A field with ObjectIdField type and non top-level 'id' path is enabled", () => {
    expect(disabledField(FIELDS.OBJECT_ID_TYPE_NESTED.path, SCHEMA)).toBe(
      false
    );
  });

  it("top level FrameNumberField type is disabled in a video dataset if path=frame_number", () => {
    expect(
      disabledField(
        FIELDS.FRAME_NUMBER_TYPE.path,
        SCHEMA,
        NOT_GROUP_DATASET,
        false,
        false,
        true
      )
    ).toBe(true);
  });

  it("top level FrameNumberField type is disabled in a frameView if path = frame_number", () => {
    expect(
      disabledField(
        FIELDS.FRAME_NUMBER_TYPE.path,
        SCHEMA,
        NOT_GROUP_DATASET,
        true,
        false,
        false
      )
    ).toBe(true);
  });

  it("top-level FrameNumberField type is disabled in a frameView if path != frame_number", () => {
    expect(
      disabledField(
        FIELDS.FRAME_NUMBER_CUSTOM_FIELD_TYPE.path,
        SCHEMA,
        NOT_GROUP_DATASET,
        true,
        false,
        false
      )
    ).toBe(false);
  });

  it("A field with type FrameSupportField is enabled if not ClipView and a top level path ", () => {
    expect(
      disabledField(
        FIELDS.FRAME_SUPPORT_TYPE.path,
        SCHEMA,
        NOT_GROUP_DATASET,
        false,
        false
      )
    ).toBe(false);
  });

  it("A field with VectorField type is enabled", () => {
    expect(
      disabledField(FIELDS.VECTOR_TYPE.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(false);
  });

  describe("Disabled group field in schema fields", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("group field is disabled across all fields", () => {
      expect(
        disabledField(
          FIELDS.CUSTOM_EMBEDDED_DOCUMENT_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          false
        )
      ).toBe(false);
      expect(
        disabledField(FIELDS.GROUP_FIELD.path, SCHEMA, GROUP_DATASET, false)
      ).toBe(true);
    });

    it("field with parent group is disabled", () => {
      const parentPath = FIELDS.GROUP_FIELD.path;
      const path = FIELDS.GROUP_CHILD_FIELD.path;

      expect(disabledField(parentPath, SCHEMA, GROUP_DATASET)).toBe(true);
      expect(disabledField(path, SCHEMA, GROUP_DATASET)).toBe(true);
    });
  });

  describe("Video dataset disabled fields", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("frames.id field is disabled", () => {
      expect(
        disabledField(
          FIELDS.FRAME_ID_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          false,
          false,
          true
        )
      ).toBe(true);
    });

    it("frames.frame_number field is disabled", () => {
      expect(
        disabledField(
          FIELDS.FRAMES_NUMBER_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          false,
          false,
          true
        )
      ).toBe(true);
    });
  });

  describe("Patches view disabled fields", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("sample_id field is disabled in patches view", () => {
      expect(
        disabledField(
          FIELDS.SAMPLE_ID_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          false,
          false,
          false,
          true
        )
      ).toBe(true);
    });

    it("sample_id field is enabled for non patches view", () => {
      expect(
        disabledField(
          FIELDS.SAMPLE_ID_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          false,
          false,
          false,
          false
        )
      ).toBe(false);
    });
  });

  describe("Frames view disabled fields", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("sample_id field is disabled", () => {
      expect(
        disabledField(
          FIELDS.SAMPLE_ID_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          true
        )
      ).toBe(true);
    });

    it("frame_number field is disabled", () => {
      expect(
        disabledField(
          FIELDS.FRAME_NUMBER_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          true
        )
      ).toBe(true);
    });
  });

  describe("Clip view", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("sample_id field is disabled", () => {
      expect(
        disabledField(
          FIELDS.SAMPLE_ID_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          false,
          true
        )
      ).toBe(true);
    });

    it("support field is disabled", () => {
      expect(
        disabledField(
          FIELDS.FRAME_SUPPORT_TYPE.path,
          SCHEMA,
          NOT_GROUP_DATASET,
          false,
          true
        )
      ).toBe(true);
    });
  });

  describe("metadata and its children are disabled fields", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("metadata field is disabled", () => {
      expect(
        disabledField(FIELDS.METADATA_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
      ).toBe(true);
    });

    it("metadata's subpaths are disabled", () => {
      expect(
        disabledField(
          FIELDS.METADATA_WIDTH_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET
        )
      ).toBe(true);
    });
  });

  describe("label types are disabled fields", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Disabled label fields", () => {
      expect(disabledField(FIELDS.DETECTION_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.DETECTIONS_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.CLASSIFICATION_FIELD.path, SCHEMA)).toBe(
        true
      );
      expect(disabledField(FIELDS.CLASSIFICATIONS_FIELD.path, SCHEMA)).toBe(
        true
      );
      expect(disabledField(FIELDS.KEYPOINT_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.KEYPOINTS_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.TEMPORAL_DETECTION_FIELD.path, SCHEMA)).toBe(
        true
      );
      expect(disabledField(FIELDS.TEMPORAL_DETECTIONS_FIELD.path, SCHEMA)).toBe(
        true
      );
      expect(disabledField(FIELDS.REGRESSION_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.HEATMAP_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.SEGMENTATION_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.GEO_LOCATION_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.GEO_LOCATIONS_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.POLYLINE_FIELD.path, SCHEMA)).toBe(true);
      expect(disabledField(FIELDS.POLYLINES_FIELD.path, SCHEMA)).toBe(true);
    });

    it("disable a field of TemporalDetection label with FrameSupportField type", () => {
      expect(
        disabledField(FIELDS.TEMPORAL_DETECTION_FRAME_SUPPORT.path, SCHEMA)
      ).toBe(true);
    });
  });

  describe("Label fields that are disabled", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Detection nested fields that are disabled", () => {
      const disabledSubFields = getDisabledNestedLabelFields(
        "detection",
        DETECTION_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("detection", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("Polyline nested fields that are disabled", () => {
      const disabledSubFields = getDisabledNestedLabelFields(
        "polyline",
        POLYLINE_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("polyline", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("Classification nested fields that are disabled", () => {
      const disabledSubFields = getDisabledNestedLabelFields(
        "classification",
        CLASSIFICATION_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("classification", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("Regression nested fields that are disabled", () => {
      const disabledSubFields = getDisabledNestedLabelFields(
        "regression",
        REGRESSION_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("regression", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("Keypoint nested fields that are disabled", () => {
      const disabledSubFields = getDisabledNestedLabelFields(
        "keypoint",
        KEYPOINT_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("keypoint", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("Segmentation nested fields that are disabled", () => {
      SCHEMA = { ...ORIGINAL_SCHEMA };
      const disabledSubFields = getDisabledNestedLabelFields(
        "segmentation",
        SEGMENTATION_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("segmentation", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("Heatmap nested fields that are disabled", () => {
      SCHEMA = { ...ORIGINAL_SCHEMA };
      const disabledSubFields = getDisabledNestedLabelFields(
        "heatmap",
        HEATMAP_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("heatmap", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("TemporalDetection nested fields that are disabled", () => {
      SCHEMA = { ...ORIGINAL_SCHEMA };
      const disabledSubFields = getDisabledNestedLabelFields(
        "temporal",
        TEMPORAL_DETECTION_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("temporal", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("GeoLocation nested fields that are disabled", () => {
      SCHEMA = { ...ORIGINAL_SCHEMA };
      const disabledSubFields = getDisabledNestedLabelFields(
        "geolocation",
        GEOLOCATION_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("geolocation", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });

    it("GeoLocations nested fields that are disabled", () => {
      SCHEMA = { ...ORIGINAL_SCHEMA };
      const disabledSubFields = getDisabledNestedLabelFields(
        "geolocations",
        GEOLOCATIONS_DISABLED_SUB_PATHS
      );
      disabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });

      disabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(true);
      });

      const enabledSubFields = getEnabledNestedLabelFields("geolocations", [
        "foo",
        "bar",
      ]);
      enabledSubFields.forEach((field) => {
        SCHEMA[field.path] = field;
      });
      enabledSubFields.forEach((field) => {
        expect(disabledField(field.path, SCHEMA)).toBe(false);
      });
    });
  });

  describe("getPath() should convert path based on dataset.mediaType'", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("getPath should return original path when dataset.mediaType is 'image'", () => {
      expect(getPath(FIELDS.SAMPLE_ID_FIELD.path, "image", SCHEMA)).toEqual(
        FIELDS.SAMPLE_ID_FIELD.path
      );
    });

    it("getPath should return [frames.]path when dataset.mediaType is 'video'", () => {
      expect(getPath(FIELDS.SAMPLE_ID_FIELD.path, "video", SCHEMA)).toEqual(
        `frames.${FIELDS.SAMPLE_ID_FIELD.path}`
      );
    });

    it("getPath should return same paths as input when dataset.mediaType is 'video' but path does not exist in frameSchema", () => {
      expect(getPath(NON_EXISTENT_PATH, "video", SCHEMA)).toEqual(
        NON_EXISTENT_PATH
      );
    });
  });

  describe("getSubPaths()", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("getSubPaths should return error if required variables missing", () => {
      expect(() => {
        getSubPaths("", {}, "image", {});
      }).toThrow("path is required");
      expect(() => {
        getSubPaths("foo", null, "image", {});
      }).toThrow("schema is required");
      expect(() => {
        getSubPaths("foo", {}, null, {});
      }).toThrow("mediaType is required");
    });

    it("getSubPath should retrun correct subpaths in an image dataset", () => {
      expect(
        getSubPaths(FIELDS.METADATA_FIELD.path, SCHEMA, "image")
      ).toContain(FIELDS.METADATA_FIELD.path);
      expect(
        getSubPaths(FIELDS.METADATA_FIELD.path, SCHEMA, "image")
      ).toContain(FIELDS.METADATA_WIDTH_FIELD.path);
    });

    it("getSubPath should retrun an empty array if the nested field is skip field", () => {
      expect([
        ...getSubPaths(FIELDS.VECTOR_TYPE.path, SCHEMA, "image"),
      ]).toHaveLength(1);
    });
  });

  describe("List of labels", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("List of labels are disabled", () => {
      expect(
        disabledField(
          FIELDS.DETECTIONS_LIST_FIELD.path,
          SCHEMA,
          NOT_GROUP_DATASET
        )
      ).toBe(true);
      expect(disabledField(FIELDS.REGRESSION_FIELD.path, SCHEMA, "")).toBe(
        true
      );
      expect(disabledField(FIELDS.HEATMAP_FIELD.path, SCHEMA, "")).toBe(true);
      expect(disabledField(FIELDS.SEGMENTATION_FIELD.path, SCHEMA, "")).toBe(
        true
      );
    });

    it("List of non-labels are enabled", () => {
      expect(
        disabledField(FIELDS.CUSTOM_LIST_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
      ).toBe(false);
    });
  });
});
