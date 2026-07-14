import { atom } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-field schema map. The mocked `labelSchemaData(field)` reads from here.
 * Tests mutate it via `setSchema(field, ...)`.
 */
const schemaMap: Record<string, unknown> = {};

vi.mock("../../state", () => ({
  labelSchemaData: (field: string) =>
    atom(schemaMap[field] ?? { label_schema: undefined }),
  // The remaining exports aren't touched by buildNewLabelData; provide stubs
  // so the module's import graph resolves cleanly.
  isFieldReadOnly: () => false,
}));

// Stub @fiftyone/lighter and ./selectors to keep the createNew import graph
// hermetic — the real lighter package and selectors transitively pull in
// @fiftyone/state → analytics → plotly, which breaks in node environments.
vi.mock("@fiftyone/lighter", () => ({
  InteractiveDetectionHandler: class {},
}));
vi.mock("./selectors", () => ({
  defaultField: () => atom(null),
}));

vi.mock("@fiftyone/utilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/utilities")>();
  return {
    ...actual,
    // Deterministic id when none is passed.
    objectId: () => "GENERATED_ID",
  };
});

const { buildNewLabelData } = await import("./createNew");

const setSchema = (field: string, schema: unknown) => {
  schemaMap[field] = { label_schema: schema };
};

beforeEach(() => {
  for (const key of Object.keys(schemaMap)) delete schemaMap[key];
});

describe("buildNewLabelData", () => {
  describe("type _cls discriminator", () => {
    it("returns _cls 'Classification' for CLASSIFICATION", () => {
      const data = buildNewLabelData("foo", "Classification");
      expect(data._cls).toBe("Classification");
    });

    it("returns _cls 'Detection' for DETECTION", () => {
      const data = buildNewLabelData("foo", "Detection");
      expect(data._cls).toBe("Detection");
    });

    it("returns _cls 'Polyline' for POLYLINE", () => {
      const data = buildNewLabelData("foo", "Polyline");
      expect(data._cls).toBe("Polyline");
    });
  });

  describe("id", () => {
    it("uses the supplied id when given", () => {
      const data = buildNewLabelData("foo", "Detection", { id: "my-id" });
      expect(data._id).toBe("my-id");
    });

    it("generates an id when none is supplied", () => {
      const data = buildNewLabelData("foo", "Detection");
      expect(data._id).toBe("GENERATED_ID");
    });
  });

  describe("labelValue resolution", () => {
    it("uses options.labelValue when provided", () => {
      setSchema("foo", { classes: ["dog", "cat"], default: "fallback" });
      const data = buildNewLabelData("foo", "Detection", {
        labelValue: "explicit",
      });
      expect((data as { label?: string }).label).toBe("explicit");
    });

    it("falls through to the schema's first class when no labelValue", () => {
      setSchema("foo", { classes: ["dog", "cat"] });
      const data = buildNewLabelData("foo", "Detection");
      expect((data as { label?: string }).label).toBe("dog");
    });

    it("omits the label field when no labelValue and no classes", () => {
      setSchema("foo", {});
      const data = buildNewLabelData("foo", "Detection");
      expect("label" in data).toBe(false);
    });
  });

  describe("schema defaults", () => {
    it("applies the schema-level default to the label field", () => {
      // schema.default takes effect first, then labelValue overrides via spread
      setSchema("foo", { default: "schema-default" });
      const data = buildNewLabelData("foo", "Detection");
      expect((data as { label?: string }).label).toBe("schema-default");
    });

    it("applies attribute-level defaults", () => {
      setSchema("foo", {
        attributes: [
          { name: "color", default: "red" },
          { name: "size", default: 10 },
        ],
      });
      const data = buildNewLabelData("foo", "Detection") as Record<
        string,
        unknown
      >;
      expect(data.color).toBe("red");
      expect(data.size).toBe(10);
    });

    it("skips attributes without a default", () => {
      setSchema("foo", {
        attributes: [{ name: "color" }, { name: "size", default: 10 }],
      });
      const data = buildNewLabelData("foo", "Detection") as Record<
        string,
        unknown
      >;
      expect("color" in data).toBe(false);
      expect(data.size).toBe(10);
    });

    it("labelValue overrides schema-level default", () => {
      setSchema("foo", { default: "from-schema" });
      const data = buildNewLabelData("foo", "Detection", {
        labelValue: "explicit",
      });
      expect((data as { label?: string }).label).toBe("explicit");
    });
  });

  describe("polyline specifics", () => {
    it("includes closed=false and filled=false by default", () => {
      const data = buildNewLabelData("foo", "Polyline") as Record<
        string,
        unknown
      >;
      expect(data.closed).toBe(false);
      expect(data.filled).toBe(false);
    });

    it("seeds points with the origin when provided", () => {
      const data = buildNewLabelData("foo", "Polyline", {
        origin: [0.1, 0.2],
      }) as Record<string, unknown>;
      expect(data.points).toEqual([[[0.1, 0.2]]]);
    });

    it("returns empty points when no origin", () => {
      const data = buildNewLabelData("foo", "Polyline") as Record<
        string,
        unknown
      >;
      expect(data.points).toEqual([]);
    });

    it("ignores origin for non-polyline types", () => {
      const data = buildNewLabelData("foo", "Detection", {
        origin: [0.1, 0.2],
      }) as Record<string, unknown>;
      expect("points" in data).toBe(false);
    });
  });
});
