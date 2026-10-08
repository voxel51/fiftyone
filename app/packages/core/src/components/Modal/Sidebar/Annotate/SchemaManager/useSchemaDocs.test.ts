import { describe, expect, it } from "vitest";
import {
  docFieldTier,
  PROTECTED_PATHS,
  withoutFieldTier,
  withAttributeTier,
  withFieldTier,
  type SchemaDoc,
} from "./useSchemaDocs";

const doc = (overrides: Partial<SchemaDoc> = {}): SchemaDoc => ({
  id: "d1",
  name: "lens",
  label_schema: { car: { type: "detections" } },
  visibility: { fields: {} },
  ...overrides,
});

describe("docFieldTier", () => {
  it("hidden wins; a scanned field is annotate even under a legacy explore", () => {
    const d = doc({
      visibility: {
        fields: {
          car: { tier: "hidden" },
          notes: { tier: "annotate" },
          gt: { tier: "explore" },
        },
      },
    });
    expect(docFieldTier(d, "car")).toBe("hidden");
    // Explicit annotate without content cannot render inputs → explore.
    expect(docFieldTier(d, "notes")).toBe("explore");
    expect(docFieldTier(d, "gt")).toBe("explore");
    // A set-up field with a legacy "explore" demotion reads as annotate:
    // there is no explore-only state for a scanned field.
    const demoted = doc({
      visibility: { fields: { car: { tier: "explore" } } },
    });
    expect(docFieldTier(demoted, "car")).toBe("annotate");
  });

  it("never hides media_reference or a dataset's group field", () => {
    const d = doc({
      visibility: {
        default: "hidden",
        fields: {
          media_reference: { tier: "hidden" },
          group: { tier: "hidden" },
        },
      },
    });
    expect(docFieldTier(d, "media_reference")).toBe("explore");
    // the group field is protected when the dataset's set includes it
    expect(docFieldTier(d, "group")).toBe("hidden");
    const groupProtected = new Set([
      ...PROTECTED_PATHS,
      "group",
      "group.id",
      "group.name",
    ]);
    expect(docFieldTier(d, "group", groupProtected)).toBe("explore");
    const nested = doc({
      visibility: { fields: { "group.name": { tier: "hidden" } } },
    });
    expect(docFieldTier(nested, "group.name", groupProtected)).toBe("explore");
  });

  it("content membership implies annotate; default covers the rest", () => {
    expect(docFieldTier(doc(), "car")).toBe("annotate");
    expect(docFieldTier(doc(), "gt")).toBe("explore");
    const hiddenDefault = doc({
      visibility: { default: "hidden", fields: {} },
    });
    expect(docFieldTier(hiddenDefault, "gt")).toBe("hidden");
    expect(docFieldTier(hiddenDefault, "car")).toBe("annotate");
    // An explicit non-hidden tier keeps an unscanned field visible
    // even under a hidden default.
    const pinned = doc({
      visibility: { default: "hidden", fields: { gt: { tier: "explore" } } },
    });
    expect(docFieldTier(pinned, "gt")).toBe("explore");
  });
});

describe("visibility updaters", () => {
  it("withFieldTier replaces one field's tier, preserving attributes", () => {
    const vis = {
      default: "explore" as const,
      fields: {
        car: {
          tier: "annotate" as const,
          attributes: { year: "hidden" as const },
        },
      },
    };
    const next = withFieldTier(vis, "car", "explore");
    expect(next.fields.car).toEqual({
      tier: "explore",
      attributes: { year: "hidden" },
    });
    // New fields get a fresh entry; the original is untouched.
    expect(withFieldTier(vis, "gt", "hidden").fields.gt).toEqual({
      tier: "hidden",
    });
    expect(vis.fields.car.tier).toBe("annotate");
  });

  it("withAttributeTier replaces one attribute's tier, keeping the rest", () => {
    const vis = {
      fields: {
        car: {
          tier: "annotate" as const,
          attributes: { year: "hidden" as const },
        },
      },
    };
    const next = withAttributeTier(vis, "car", "color", "explore");
    expect(next.fields.car).toEqual({
      tier: "annotate",
      attributes: { year: "hidden", color: "explore" },
    });
  });
});

describe("withoutFieldTier", () => {
  it("drops the explicit tier but keeps attribute tiers", () => {
    const vis = {
      default: "hidden" as const,
      fields: {
        car: {
          tier: "hidden" as const,
          attributes: { year: "hidden" as const },
        },
        gt: { tier: "hidden" as const },
      },
    };
    expect(withoutFieldTier(vis, "car").fields.car).toEqual({
      attributes: { year: "hidden" },
    });
    expect(withoutFieldTier(vis, "gt").fields.gt).toBeUndefined();
    expect(withoutFieldTier(vis, "missing")).toBe(vis);
  });
});
