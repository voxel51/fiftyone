import { COLOR_BY, STRING_FIELD, type Schema } from "@fiftyone/utilities";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import GridTagBubbles from "./GridTagBubbles";

const mockUseLookerOptions = vi.fn();
const mockUseSampleSchema = vi.fn();

vi.mock("@fiftyone/state", () => ({
  useSampleSchema: (params: unknown) => mockUseSampleSchema(params),
  useLookerOptions: (...args: unknown[]) => mockUseLookerOptions(...args),
}));

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
};

const COLORING = {
  by: COLOR_BY.FIELD,
  defaultMaskTargetsColors: [],
  maskTargets: {},
  points: false,
  pool: ["#06c66a", "#cc0669", "#0669cc"],
  scale: [],
  seed: 9,
  targets: [],
};

const SAMPLE = {
  filepath: "/tmp/example.pdf",
  tags: ["grid-tag"],
  _label_tags: {
    "has-label": 2,
  },
};

describe("GridTagBubbles", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { supports: (_prop: string, color?: string) => Boolean(color) },
    });
  });

  beforeEach(() => {
    mockUseSampleSchema.mockReturnValue(SCHEMA);
    mockUseLookerOptions.mockReturnValue({
      activePaths: ["filepath", "tags", "_label_tags"],
      attributeVisibility: {},
      coloring: COLORING,
      customizeColorSetting: [],
      labelTagColors: {},
      filter: () => true,
      fontSize: 14,
      selectedLabelTags: [],
      timeZone: "UTC",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders primitive and tag bubbles", () => {
    render(<GridTagBubbles sample={SAMPLE} />);

    expect(screen.queryByText("/tmp/example.pdf")).toBeTruthy();
    expect(screen.queryByText("grid-tag")).toBeTruthy();
    expect(screen.queryByText("has-label: 2")).toBeTruthy();
  });

  it("falls back to a permissive filter when options.filter is undefined", () => {
    mockUseLookerOptions.mockReturnValue({
      activePaths: ["filepath"],
      attributeVisibility: {},
      coloring: COLORING,
      customizeColorSetting: [],
      labelTagColors: {},
      filter: undefined,
      fontSize: 14,
      selectedLabelTags: [],
      timeZone: "UTC",
    });

    render(<GridTagBubbles sample={SAMPLE} />);

    expect(screen.queryByText("/tmp/example.pdf")).toBeTruthy();
  });
});
