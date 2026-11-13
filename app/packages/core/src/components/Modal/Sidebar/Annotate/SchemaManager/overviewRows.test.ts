import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOverviewRows } from "./overviewRows";
import type { SchemaDoc } from "./useSchemaDocs";
import { PROTECTED_PATHS } from "./schemaDocTypes";

const DATASET_SCHEMAS = {
  gt: { type: "detections", label_schema: { type: "detections" } },
  points: { type: "keypoints", unsupported: true },
  filepath: { type: "str" },
};

const DATASET_FIELDS = {
  gt: "Detections",
  points: "Keypoints",
  location: "GeoLocation",
  metadata: "ImageMetadata",
  filepath: "String",
  id: "ObjectId",
};

const DOC: SchemaDoc = {
  id: "doc",
  name: "doc",
  label_schema: { gt: { type: "detections" } },
  visibility: { default: "explore", fields: {} },
};

const render = (doc: SchemaDoc | null) =>
  renderHook(() =>
    useOverviewRows({
      datasetSchemas: DATASET_SCHEMAS,
      datasetFields: DATASET_FIELDS,
      doc,
      docMode: Boolean(doc),
      search: "",
      activeFields: [],
    }),
  ).result.current;

const paths = (rows: { path: string }[]) => rows.map((r) => r.path);

describe("useOverviewRows", () => {
  it("lists dataset fields that cannot be annotated", () => {
    const { rows, rowTypes } = render(DOC);
    const location = rows.find((r) => r.path === "location");
    expect(location).toMatchObject({ unsupported: true, setUp: false });
    expect(rowTypes.location).toBe("GeoLocation");
  });

  it("keeps unsupported fields hideable, after the annotatable ones", () => {
    const { sections } = render(DOC);
    expect(paths(sections.scanned)).toEqual(["gt"]);
    expect(paths(sections.unscanned)).toEqual(["location", "points"]);
    expect(paths(sections.unhideable)).toEqual(["filepath", "metadata"]);
    expect(paths(sections.system)).toEqual(["id"]);
  });

  it("hides an unsupported field the doc hides", () => {
    const { sections } = render({
      ...DOC,
      visibility: { fields: { location: { tier: "hidden" } } },
    });
    expect(paths(sections.hidden)).toEqual(["location"]);
  });

  it("never lets a group dataset's group field or media_reference be hidden", () => {
    // stable inputs: the hook memoizes on them
    const datasetFields = {
      ...DATASET_FIELDS,
      group: "Group",
      media_reference: "MediaReference",
    };
    // a group dataset's protected paths include its group field
    const protectedPaths = new Set([...PROTECTED_PATHS, "group"]);
    // even a schema that hides everything by default, or hides them
    const doc: SchemaDoc = {
      ...DOC,
      visibility: {
        default: "hidden",
        fields: {
          group: { tier: "hidden" },
          media_reference: { tier: "hidden" },
        },
      },
    };
    const { result } = renderHook(() =>
      useOverviewRows({
        datasetSchemas: DATASET_SCHEMAS,
        datasetFields,
        protectedPaths,
        doc,
        docMode: true,
        search: "",
        activeFields: [],
      }),
    );

    const { sections } = result.current;
    expect(paths(sections.unhideable)).toEqual(
      expect.arrayContaining(["group", "media_reference"]),
    );
    expect(paths(sections.hidden)).not.toContain("group");
    expect(paths(sections.hidden)).not.toContain("media_reference");
    expect(paths(sections.hidden)).toContain("location");
  });
});
