import {
  COLOR_BY,
  LIST_FIELD,
  STRING_FIELD,
  type Schema,
} from "@fiftyone/utilities";
import { beforeAll, describe, expect, it } from "vitest";
import { computeTagData } from "./computeTagData";

const SCHEMA: Schema = {
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
  fieldSchema: SCHEMA,
  filter: () => true,
  labelTagColors: {},
  sample: {
    filepath: "/tmp/sample-1.png",
    str_list: ["a", "b", "c", "d"],
    tags: ["sample-tag"],
    _label_tags: {
      keep: 2,
      skip: 1,
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
