import { afterEach, describe, expect, it, vi } from "vitest";
import { TestSelectorFamily, setMockAtoms } from "../../../../__mocks__/recoil";
import * as ss from "./schemaSettings.atoms";

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

describe("schema search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("search for 'foo' should have 'foo' in it when 'foo' is a valid field path", async () => {
    setMockAtoms({
      viewSchemaState: {},
      fieldSchemaState: { id: BASE_FIELD },
    });
    const test = <TestSelectorFamily<typeof ss.schemaSearchResultsSelector>>(
      (<unknown>await ss.schemaSearchResultsSelector(["bar"]))
    );
    console.log("test", test, typeof test);
    expect(test()).toBe(["is"]);
  });
});
