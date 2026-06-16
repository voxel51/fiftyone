/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutable backing state for the schema mocks — refs.* updated per-test.
const refs = vi.hoisted(() => ({
  visible: [] as string[],
  fieldTypeByPath: {} as Record<string, string>,
  schemaByPath: {} as Record<
    string,
    { type?: string; read_only?: boolean; label_schema?: unknown }
  >,
  labelsByPathValue: {} as Record<string, Array<unknown>>,
}));

vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  return { ...actual, useRecoilValue: () => false };
});

vi.mock("../../state", () => ({
  labelSchemaData: (path: string) =>
    atom(refs.schemaByPath[path] ?? { type: undefined, read_only: false }),
  isFieldReadOnly: (schema: { read_only?: boolean } | undefined | null) =>
    Boolean(schema?.read_only),
  fieldType: (path: string) =>
    atom(refs.fieldTypeByPath[path] ?? "Detection"),
  visibleLabelSchemas: atom((get) => {
    // Read the mutable cell so updates to `refs.visible` are picked up via
    // a poke to `visibleTrigger` between tests.
    get(visibleTrigger);
    return refs.visible;
  }),
}));

vi.mock("../../useLabels", () => ({
  labelsByPath: atom((get) => {
    get(labelsByPathTrigger);
    return refs.labelsByPathValue;
  }),
}));

// Triggers let us invalidate jotai-cached derived atoms when refs.* mutate.
const visibleTrigger = atom(0);
const labelsByPathTrigger = atom(0);

const { useAnnotationFields } = await import("./useAnnotationFields");
const { editingLabelAtom, pendingNewTypeAtom } = await import("./atoms");

// ── Helpers ──────────────────────────────────────────────────────────────────

const store = getDefaultStore();

const setVisible = (paths: string[]) => {
  refs.visible = paths;
  store.set(visibleTrigger, (n) => n + 1);
};

const setLabelsByPath = (map: Record<string, Array<unknown>>) => {
  refs.labelsByPathValue = map;
  store.set(labelsByPathTrigger, (n) => n + 1);
};

beforeEach(() => {
  vi.clearAllMocks();
  refs.visible = [];
  refs.fieldTypeByPath = {};
  refs.schemaByPath = {};
  refs.labelsByPathValue = {};
  store.set(visibleTrigger, 0);
  store.set(labelsByPathTrigger, 0);
  store.set(editingLabelAtom, null);
  store.set(pendingNewTypeAtom, null);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useAnnotationFields type resolution", () => {
  it("uses the explicit type argument when provided", () => {
    refs.fieldTypeByPath = { gt: "Detection", lines: "Polyline" };
    setVisible(["gt", "lines"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.fields).toEqual(["gt"]);
  });

  it("returns empty arrays/sets when type is explicitly null", () => {
    refs.fieldTypeByPath = { gt: "Detection" };
    setVisible(["gt"]);

    const { result } = renderHook(() => useAnnotationFields(null));
    expect(result.current.fields).toEqual([]);
    expect(result.current.defaultField).toBe(null);
    expect(result.current.disabledFields.size).toBe(0);
  });

  it("binds to the current pendingNewType when no arg is given", () => {
    refs.fieldTypeByPath = { gt: "Detection", lines: "Polyline" };
    setVisible(["gt", "lines"]);
    store.set(pendingNewTypeAtom, "Polyline");

    const { result } = renderHook(() => useAnnotationFields());
    expect(result.current.fields).toEqual(["lines"]);
  });

  it("returns empty for undefined type when there's no current selection", () => {
    refs.fieldTypeByPath = { gt: "Detection" };
    setVisible(["gt"]);

    const { result } = renderHook(() => useAnnotationFields(undefined));
    expect(result.current.fields).toEqual([]);
  });
});

describe("useAnnotationFields.fields", () => {
  it("filters to fields whose schema type matches the requested label type", () => {
    refs.fieldTypeByPath = {
      gt: "Detection",
      preds: "Detection",
      lines: "Polyline",
      cls: "Classification",
    };
    setVisible(["gt", "preds", "lines", "cls"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.fields).toEqual(["gt", "preds"]);
  });

  it("includes plural-form fields (e.g. 'Detections') for a singular request", () => {
    refs.fieldTypeByPath = { gt: "Detection", preds: "Detections" };
    setVisible(["gt", "preds"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.fields.sort()).toEqual(["gt", "preds"]);
  });

  it("excludes read-only fields", () => {
    refs.fieldTypeByPath = { gt: "Detection", locked: "Detection" };
    refs.schemaByPath = { locked: { type: "Detection", read_only: true } };
    setVisible(["gt", "locked"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.fields).toEqual(["gt"]);
  });

  it("returns fields sorted alphabetically", () => {
    refs.fieldTypeByPath = { zeta: "Detection", alpha: "Detection", mid: "Detection" };
    setVisible(["zeta", "alpha", "mid"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.fields).toEqual(["alpha", "mid", "zeta"]);
  });
});

describe("useAnnotationFields.defaultField", () => {
  it("returns the first non-disabled field", () => {
    refs.fieldTypeByPath = { alpha: "Detection", beta: "Detection" };
    setVisible(["alpha", "beta"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.defaultField).toBe("alpha");
  });

  it("skips fields disabled by single-cardinality + already-labeled rule", () => {
    refs.fieldTypeByPath = { single: "Detection", multi: "Detections" };
    // `single` is a singular Detection field that already has a label →
    // `disabledFields` includes it; `multi` is a list type → never disabled.
    refs.schemaByPath = {
      single: { type: "Detection" },
      multi: { type: "Detections" },
    };
    setLabelsByPath({ single: [{}] });
    setVisible(["single", "multi"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.disabledFields.has("single")).toBe(true);
    expect(result.current.defaultField).toBe("multi");
  });

  it("returns null when no fields are available", () => {
    setVisible([]);
    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.defaultField).toBe(null);
  });
});

describe("useAnnotationFields.disabledFields", () => {
  it("disables single-cardinality fields that already have a label", () => {
    refs.fieldTypeByPath = { gt: "Detection" };
    refs.schemaByPath = { gt: { type: "Detection" } };
    setLabelsByPath({ gt: [{ id: "existing" }] });
    setVisible(["gt"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.disabledFields.has("gt")).toBe(true);
  });

  it("does not disable list-cardinality fields even when they have labels", () => {
    refs.fieldTypeByPath = { preds: "Detections" };
    refs.schemaByPath = { preds: { type: "Detections" } };
    setLabelsByPath({ preds: [{ id: "1" }, { id: "2" }] });
    setVisible(["preds"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.disabledFields.has("preds")).toBe(false);
  });

  it("does not disable empty single-cardinality fields", () => {
    refs.fieldTypeByPath = { gt: "Detection" };
    refs.schemaByPath = { gt: { type: "Detection" } };
    setLabelsByPath({});
    setVisible(["gt"]);

    const { result } = renderHook(() => useAnnotationFields("Detection"));
    expect(result.current.disabledFields.has("gt")).toBe(false);
  });
});

describe("useAnnotationFields return-value memoization", () => {
  it("returns a stable object reference when underlying values are unchanged", () => {
    refs.fieldTypeByPath = { gt: "Detection" };
    setVisible(["gt"]);

    const { result, rerender } = renderHook(() =>
      useAnnotationFields("Detection")
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns a new object reference when the field list changes", () => {
    refs.fieldTypeByPath = { gt: "Detection" };
    setVisible(["gt"]);

    const { result, rerender } = renderHook(() =>
      useAnnotationFields("Detection")
    );
    const first = result.current;

    refs.fieldTypeByPath = { gt: "Detection", new_field: "Detection" };
    setVisible(["gt", "new_field"]);
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.fields).toContain("new_field");
  });
});
