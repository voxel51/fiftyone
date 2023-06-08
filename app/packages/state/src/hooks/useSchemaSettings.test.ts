import { afterEach, describe, expect, it, vi } from "vitest";
import { disabledField } from "./useSchemaSettings.utils";
import { OBJECT_ID_FIELD } from "@fiftyone/utilities";

const FIELDS = {
  ID_FIELD: {
    path: "id",
    embeddedDocType: null,
    ftype: OBJECT_ID_FIELD,
    description: null,
    info: null,
    name: null,
    fields: null,
    dbField: null,
    subfield: null,
    visible: false,
  },
};

const GROUP_DATASET = "group";
const NOT_GROUP_DATASET = "";

describe("Disabled schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("id path is disabled across all fields", () => {
    const path = "id";
    const field_1 = FIELDS.ID_FIELD;
    const schema = { id: field_1 };

    expect(disabledField(path, schema, NOT_GROUP_DATASET)).toBe(true);
  });
});
