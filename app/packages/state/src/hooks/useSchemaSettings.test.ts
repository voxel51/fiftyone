import { afterEach, describe, expect, it, vi } from "vitest";
import { disabledField } from "./useSchemaSettings";
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

describe("Disabled schema fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("id path is disabled across all fields", () => {
    const path = "id";
    const field_1 = FIELDS.ID_FIELD;
    const schema = { id: field_1 };
    const isGroupDataset = "group";
    expect(disabledField(path, schema, isGroupDataset)).toBe(true);
  });
});
