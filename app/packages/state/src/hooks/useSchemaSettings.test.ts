import { afterEach, describe, expect, it, vi } from "vitest";
import { disabledField } from "./useSchemaSettings.utils";
import {
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD_V2,
  EMBEDDED_DOCUMENT_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_FIELD,
  INT_FIELD,
  KEYPOINT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
  REGRESSION_FIELD,
  SEGMENTATION_FIELD,
  STRING_FIELD,
  TEMPORAL_DETECTION,
  TEMPORAL_DETECTIONS,
  TEMPORAL_DETECTIONS_FIELD,
  TEMPORAL_DETECTION_FIELD,
} from "@fiftyone/utilities";
import { FRAME_SUPPORT_FIELD } from "@fiftyone/utilities";
import { VECTOR_FIELD } from "@fiftyone/utilities";

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

const FIELDS = {
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
  METADATA_FIELD: {
    ...BASE_FIELD,
    path: "metadata",
    ftype: EMBEDDED_DOCUMENT_FIELD,
  },
  OBJECT_ID_TYPE: {
    ...BASE_FIELD,
    path: "ObjectIdType",
    ftype: OBJECT_ID_FIELD,
  },
  FRAME_NUMBER_TYPE: {
    ...BASE_FIELD,
    path: "FrameNumberField",
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
    path: "frames.number",
    ftype: FRAME_NUMBER_FIELD,
  },
  SAMPLE_ID_FIELD: {
    ...BASE_FIELD,
    path: "sample_id",
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
  TEMPORAL_DETECTIONS_FIELD: {
    ...BASE_FIELD,
    path: "temporals",
    ftype: TEMPORAL_DETECTIONS_FIELD,
  },
};

const SCHEMA = {};
Object.values(FIELDS).forEach((f) => {
  SCHEMA[f.path] = f;
});

// const SCHEMA = {
//   id: FIELDS.ID_FIELD,
//   filepath: FIELDS.FILEPATH_FIELD,
//   tags: FIELDS.TAGS_FIELD,
//   metadata: FIELDS.METADATA_FIELD,
//   [FIELDS.SAMPLE_ID_FIELD.path]: FIELDS.SAMPLE_ID_FIELD,
//   [FIELDS.FRAME_NUMBER_FIELD.path]: FIELDS.FRAME_NUMBER_FIELD,
//   [FIELDS.FRAME_ID_FIELD.path]: FIELDS.FRAME_ID_FIELD,
//   [FIELDS.FRAMES_NUMBER_FIELD.path]: FIELDS.FRAMES_NUMBER_FIELD,
//   ObjectIdType: FIELDS.ID_FIELD,
//   FrameNumberField: FIELDS.FRAME_NUMBER_TYPE,
//   FrameSupportField: FIELDS.FRAME_SUPPORT_TYPE,
//   VectorField: FIELDS.VECTOR_TYPE,
//   [FIELDS.CUSTOM_EMBEDDED_DOCUMENT_FIELD.path]:
//     FIELDS.CUSTOM_EMBEDDED_DOCUMENT_FIELD,
//   [GROUP_DATASET]: FIELDS.GROUP_FIELD,
//   [`${GROUP_DATASET}.name`]: FIELDS.GROUP_CHILD_FIELD,

// };

describe("Disabled field paths in schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("id path is disabled across all fields", () => {
    expect(disabledField("id", SCHEMA, NOT_GROUP_DATASET)).toBe(true);
  });

  it("filepath path is disabled across all fields", () => {
    expect(disabledField(FIELDS.FILEPATH_FIELD.path, SCHEMA, "")).toBe(true);
  });

  it("tags path is disabled across all fields", () => {
    expect(disabledField(FIELDS.TAGS_FIELD.path, SCHEMA, "")).toBe(true);
  });

  it("metadata path is disabled across all fields", () => {
    expect(disabledField(FIELDS.METADATA_FIELD.path, SCHEMA, "")).toBe(true);
  });
});

describe("Disabled field types in schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ObjectIdField type is disabled across all fields", () => {
    expect(disabledField(FIELDS.OBJECT_ID_TYPE.path, SCHEMA, "")).toBe(true);
  });

  it("FrameNumberField type is disabled across all fields", () => {
    expect(
      disabledField(FIELDS.FRAME_NUMBER_TYPE.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });

  it("FrameSupportField type is disabled across all fields", () => {
    expect(
      disabledField(FIELDS.FRAME_SUPPORT_TYPE.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });

  it("VectorField type is disabled across all fields", () => {
    expect(
      disabledField(FIELDS.VECTOR_TYPE.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });
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
      disabledField(FIELDS.FRAME_ID_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });

  it("frames.frame_number field is disabled", () => {
    expect(
      disabledField(FIELDS.FRAMES_NUMBER_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });
});

describe("Patches view disabled fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sample_id field is disabled", () => {
    expect(
      disabledField(FIELDS.SAMPLE_ID_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });
});

describe("Frames view disabled fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sample_id field is disabled", () => {
    expect(
      disabledField(FIELDS.SAMPLE_ID_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
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

describe("Clip view disabled fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sample_id field is disabled", () => {
    expect(
      disabledField(FIELDS.SAMPLE_ID_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });

  it("support field is disabled", () => {
    expect(
      disabledField(FIELDS.FRAME_SUPPORT_TYPE.path, SCHEMA, NOT_GROUP_DATASET)
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
      disabledField(FIELDS.METADATA_WIDTH_FIELD.path, SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });
});

describe("label types are disabled fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("LABEL fields are disabled", () => {
    expect(disabledField(FIELDS.DETECTION_FIELD.path, SCHEMA, "")).toBe(true);
    expect(disabledField(FIELDS.DETECTIONS_FIELD.path, SCHEMA, "")).toBe(true);
    expect(disabledField(FIELDS.CLASSIFICATION_FIELD.path, SCHEMA, "")).toBe(
      true
    );
    expect(disabledField(FIELDS.CLASSIFICATIONS_FIELD.path, SCHEMA, "")).toBe(
      true
    );
    expect(disabledField(FIELDS.KEYPOINT_FIELD.path, SCHEMA, "")).toBe(true);
    expect(
      disabledField(FIELDS.TEMPORAL_DETECTION_FIELD.path, SCHEMA, "")
    ).toBe(true);
    expect(
      disabledField(FIELDS.TEMPORAL_DETECTIONS_FIELD.path, SCHEMA, "")
    ).toBe(true);
    expect(disabledField(FIELDS.REGRESSION_FIELD.path, SCHEMA, "")).toBe(true);
    expect(disabledField(FIELDS.HEATMAP_FIELD.path, SCHEMA, "")).toBe(true);
    expect(disabledField(FIELDS.SEGMENTATION_FIELD.path, SCHEMA, "")).toBe(
      true
    );
    expect(disabledField(FIELDS.GEO_LOCATION_FIELD.path, SCHEMA, "")).toBe(
      true
    );
    expect(disabledField(FIELDS.GEO_LOCATIONS_FIELD.path, SCHEMA, "")).toBe(
      true
    );
    expect(disabledField(FIELDS.POLYLINE_FIELD.path, SCHEMA, "")).toBe(true);
    expect(disabledField(FIELDS.POLYLINES_FIELD.path, SCHEMA, "")).toBe(true);
  });
});
