import {
  COLOR_BY,
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  STRING_FIELD,
  type Schema,
} from "@fiftyone/utilities";
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
  pool: ["#06c66a", "#cc0669", "#0669cc"],
  scale: [],
  seed: 9,
  targets: [],
};

const SAMPLE = {
  filepath: "/tmp/example.pdf",
  tags: ["grid-tag"],
  ground_truth: {
    _cls: "Detections",
    detections: [
      { _cls: "Detection", label: "cat", tags: ["has-label"] },
      { _cls: "Detection", label: "dog", tags: ["has-label"] },
    ],
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
