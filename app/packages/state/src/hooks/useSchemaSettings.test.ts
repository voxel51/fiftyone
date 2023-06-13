import { afterEach, describe, expect, it, vi } from "vitest";
import { disabledField } from "./useSchemaSettings.utils";
import {
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD_V2,
  EMBEDDED_DOCUMENT_FIELD,
  FRAME_NUMBER_FIELD,
  INT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
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
    Path: "frames.id",
    ftype: OBJECT_ID_FIELD,
  },
  FRAME_NUMBER_FIELD: {
    ...BASE_FIELD,
    Path: "frames.number",
    ftype: INT_FIELD,
  },
};

const BASE_SCHEMA = {
  id: FIELDS.ID_FIELD,
  filepath: FIELDS.FILEPATH_FIELD,
  tags: FIELDS.TAGS_FIELD,
  metadata: FIELDS.METADATA_FIELD,
};

const FRAME_SCHEMA = {
  id: FIELDS.ID_FIELD,
  frame_number: FIELDS.FRAME_NUMBER_FIELD,
};

const DISABLED_TYPES_SCHEMA = {
  ...BASE_SCHEMA,
  ObjectIdType: FIELDS.OBJECT_ID_TYPE,
  FrameNumberField: FIELDS.FRAME_NUMBER_TYPE,
  FrameSupportField: FIELDS.FRAME_SUPPORT_TYPE,
  VectorField: FIELDS.VECTOR_TYPE,
  customEmbeddedDocumentField: FIELDS.CUSTOM_EMBEDDED_DOCUMENT_FIELD,
};

describe("Disabled field paths in schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("id path is disabled across all fields", () => {
    const path = "id";
    const schema = BASE_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });

  it("filepath path is disabled across all fields", () => {
    const path = FIELDS.FILEPATH_FIELD.path;
    const schema = BASE_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });

  it("tags path is disabled across all fields", () => {
    const path = FIELDS.TAGS_FIELD.path;
    const schema = BASE_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });

  it("metadata path is disabled across all fields", () => {
    const path = FIELDS.METADATA_FIELD.path;
    const schema = BASE_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });

  it("all disabled paths are also disabled when prefixed with 'frames.'", () => {
    // TODO
    expect("TODO: double check with team wether this is needed");
  });
});

describe("Disabled field types in schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ObjectIdField type is disabled across all fields", () => {
    const path = FIELDS.OBJECT_ID_TYPE.path;
    const schema = DISABLED_TYPES_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });

  it("FrameNumberField type is disabled across all fields", () => {
    const path = FIELDS.FRAME_NUMBER_TYPE.path;
    const schema = DISABLED_TYPES_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });

  it("FrameSupportField type is disabled across all fields", () => {
    const path = FIELDS.FRAME_SUPPORT_TYPE.path;
    const schema = DISABLED_TYPES_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });

  it("VectorField type is disabled across all fields", () => {
    const path = FIELDS.VECTOR_TYPE.path;
    const schema = DISABLED_TYPES_SCHEMA;

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
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
        DISABLED_TYPES_SCHEMA,
        NOT_GROUP_DATASET
      )
    ).toBe(false);
    expect(
      disabledField(
        FIELDS.CUSTOM_EMBEDDED_DOCUMENT_FIELD.path,
        DISABLED_TYPES_SCHEMA,
        GROUP_DATASET
      )
    ).toBe(true);
  });

  it("field with parent group is disabled", () => {
    const parentPath = FIELDS.GROUP_FIELD.path;
    const path = FIELDS.GROUP_CHILD_FIELD.path;
    const schema = DISABLED_TYPES_SCHEMA;

    expect(disabledField(parentPath, schema, GROUP_DATASET)).toBe(true);
    expect(disabledField(path, schema, GROUP_DATASET)).toBe(true);
  });
});

describe("Video dataset disabled fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("frames.id field is disabled", () => {
    expect(
      disabledField(FIELDS.FRAME_ID_FIELD.path, FRAME_SCHEMA, NOT_GROUP_DATASET)
    ).toBe(true);
  });

  it("frames.frame_number field is disabled", () => {
    expect(
      disabledField(
        FIELDS.FRAME_NUMBER_FIELD.path,
        FRAME_SCHEMA,
        NOT_GROUP_DATASET
      )
    ).toBe(true);
  });
});
