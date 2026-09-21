import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore } from "jotai";
import * as ss from "./schemaSettings.atoms";
import { FIELDS } from "../hooks/useSchemaSettings.utils.test";

const NON_EXISTENT_PATH = "non-existent-path";

describe("schema search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("search for 'id' should have 'id' in the results", async () => {
    const schemaFields = {
      [FIELDS.ID_FIELD.path]: FIELDS.ID_FIELD,
      [FIELDS.FILEPATH_FIELD.path]: FIELDS.FILEPATH_FIELD,
    };

    const store = createStore();
    store.set(ss.viewSchemaState, {});
    store.set(ss.fieldSchemaState, schemaFields);
    store.set(ss.schemaSearchResultList, [FIELDS.ID_FIELD.path]);

    const contents = store.get(ss.schemaSearchResultList);

    expect(contents).toEqual([FIELDS.ID_FIELD.path]);
  });

  it("should return an emoty array when searching for non-existent field path", () => {
    const schemaFields = {
      [FIELDS.ID_FIELD.path]: FIELDS.ID_FIELD,
      [FIELDS.FILEPATH_FIELD.path]: FIELDS.FILEPATH_FIELD,
    };

    const store = createStore();
    store.set(ss.viewSchemaState, {});
    store.set(ss.fieldSchemaState, schemaFields);
    store.set(ss.schemaSearchResultList, [NON_EXISTENT_PATH]);

    const contents = store.get(ss.schemaSearchResultList);

    expect(contents).toEqual([]);
  });
});
