/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import {
  atom,
  getDefaultStore,
  type PrimitiveAtom,
} from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories run before imports, so external state lives in vi.hoisted().
const refs = vi.hoisted(() => ({
  schemas: {} as Record<string, unknown>,
  visibleSchemas: [] as string[],
  labelsByPath: {} as Record<string, Array<{ data?: { label?: string } }>>,
  lighter: null as unknown,
}));

vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  return { ...actual, useRecoilValue: () => false };
});

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => refs.lighter,
}));

// Stub the schema-state module the hook depends on.
vi.mock("../../state", () => ({
  labelSchemaData: (field: string) =>
    atom(refs.schemas[field] ?? { label_schema: undefined }),
  isFieldReadOnly: () => false,
  fieldType: (field: string) =>
    atom((refs.schemas[field] as { type?: string })?.type ?? "Detection"),
  visibleLabelSchemas: atom<string[]>([]),
}));

vi.mock("../../useLabels", () => ({
  labelsByPath: atom<Record<string, unknown>>({}),
}));

vi.mock("@fiftyone/utilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/utilities")>();
  return { ...actual, objectId: () => "GENERATED_ID" };
});

import type { AnnotationLabel } from "@fiftyone/state";

const { useAnnotationContext } = await import("./useAnnotationContext");
const {
  currentEditingMaskAtom,
  editingLabelAtom,
  pendingNewTypeAtom,
  savedLabel,
} = await import("./atoms");

// ── Helpers ──────────────────────────────────────────────────────────────────

const store = getDefaultStore();

const makeLabel = (overrides?: {
  id?: string;
  type?: AnnotationLabel["type"];
  path?: string;
  data?: Record<string, unknown>;
  overlay?: { id: string; [k: string]: unknown };
  isNew?: boolean;
}): AnnotationLabel => {
  const id = overrides?.id ?? "label-id";
  return {
    path: overrides?.path ?? "ground_truth",
    type: overrides?.type ?? ("Detection" as AnnotationLabel["type"]),
    data: {
      _id: id,
      _cls: "Detection",
      ...overrides?.data,
    },
    overlay: (overrides?.overlay ?? { id }) as AnnotationLabel["overlay"],
    isNew: overrides?.isNew,
  } as AnnotationLabel;
};

const makeLabelAtom = (label: AnnotationLabel) =>
  atom(label) as PrimitiveAtom<AnnotationLabel>;

const resetAtoms = () => {
  store.set(editingLabelAtom, null);
  store.set(pendingNewTypeAtom, null);
  store.set(savedLabel, null);
  store.set(currentEditingMaskAtom, false);
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(refs.schemas)) delete refs.schemas[k];
  refs.visibleSchemas.length = 0;
  for (const k of Object.keys(refs.labelsByPath)) delete refs.labelsByPath[k];
  refs.lighter = {
    scene: null,
    addOverlay: vi.fn(),
    overlayFactory: { create: vi.fn() },
  };
  resetAtoms();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useAnnotationContext.select", () => {
  it("points editingLabelAtom at the supplied atom and snapshots savedLabel", () => {
    const label = makeLabel({ id: "abc" });
    const labelAtom = makeLabelAtom(label);

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.select(labelAtom));

    expect(store.get(editingLabelAtom)).toBe(labelAtom);
    expect(store.get(savedLabel)).toEqual(label.data);
  });

  it("clears any pending new-type schema flow", () => {
    store.set(pendingNewTypeAtom, "Detection");

    const labelAtom = makeLabelAtom(makeLabel());
    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.select(labelAtom));

    expect(store.get(pendingNewTypeAtom)).toBe(null);
  });

  it("seeds isEditingMask=true when the label has an inline mask", () => {
    const labelAtom = makeLabelAtom(
      makeLabel({ data: { mask: { bitmap: "data" } } })
    );

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.select(labelAtom));

    expect(result.current.selected.isEditingMask).toBe(true);
  });

  it("seeds isEditingMask=true when the label has a mask_path", () => {
    const labelAtom = makeLabelAtom(
      makeLabel({ data: { mask_path: "/path/to/mask.png" } })
    );

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.select(labelAtom));

    expect(result.current.selected.isEditingMask).toBe(true);
  });

  it("seeds isEditingMask=false when the label has neither mask nor mask_path", () => {
    // Pre-seed true so we can confirm `select` actively resets it.
    store.set(currentEditingMaskAtom, true);

    const labelAtom = makeLabelAtom(makeLabel());
    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.select(labelAtom));

    expect(result.current.selected.isEditingMask).toBe(false);
  });
});

describe("useAnnotationContext.clear", () => {
  it("resets all editing atoms", () => {
    const labelAtom = makeLabelAtom(makeLabel());
    store.set(editingLabelAtom, labelAtom);
    store.set(pendingNewTypeAtom, "Detection");
    store.set(savedLabel, { _id: "x" } as AnnotationLabel["data"]);
    store.set(currentEditingMaskAtom, true);

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.clear());

    expect(store.get(editingLabelAtom)).toBe(null);
    expect(store.get(pendingNewTypeAtom)).toBe(null);
    expect(store.get(savedLabel)).toBe(null);
    expect(store.get(currentEditingMaskAtom)).toBe(false);
  });

  it("records the cleared label's field+class into lastUsed memory", () => {
    const labelAtom = makeLabelAtom(
      makeLabel({ path: "predictions", data: { label: "dog" } })
    );
    store.set(editingLabelAtom, labelAtom);

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.clear());

    // No remembered class for an unrelated field — falls through to
    // labelsByPath then to schema; here it's null because both are empty.
    expect(result.current.lastUsed.fieldFor("Detection")).toBe("predictions");
    expect(result.current.lastUsed.labelFor("predictions")).toBe("dog");
  });
});

describe("useAnnotationContext.setEditingMask", () => {
  it("writes the flag when id matches the current label", () => {
    const labelAtom = makeLabelAtom(makeLabel({ id: "abc" }));
    store.set(editingLabelAtom, labelAtom);

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.setEditingMask("abc", true));

    expect(store.get(currentEditingMaskAtom)).toBe(true);
  });

  it("ignores writes for non-current label ids (other-label events)", () => {
    const labelAtom = makeLabelAtom(makeLabel({ id: "abc" }));
    store.set(editingLabelAtom, labelAtom);

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.setEditingMask("different-id", true));

    expect(store.get(currentEditingMaskAtom)).toBe(false);
  });

  it("ignores writes when no label is being edited", () => {
    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.setEditingMask("abc", true));

    expect(store.get(currentEditingMaskAtom)).toBe(false);
  });

  it("can flip the flag back to false for the current label", () => {
    const labelAtom = makeLabelAtom(makeLabel({ id: "abc" }));
    store.set(editingLabelAtom, labelAtom);
    store.set(currentEditingMaskAtom, true);

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.setEditingMask("abc", false));

    expect(store.get(currentEditingMaskAtom)).toBe(false);
  });
});

describe("useAnnotationContext.isEditingAtom", () => {
  it("returns true for the atom currently in editingLabelAtom", () => {
    const labelAtom = makeLabelAtom(makeLabel());
    store.set(editingLabelAtom, labelAtom);

    const { result } = renderHook(() => useAnnotationContext());
    expect(result.current.isEditingAtom(labelAtom)).toBe(true);
  });

  it("returns false for a different atom", () => {
    const labelAtom = makeLabelAtom(makeLabel({ id: "a" }));
    const otherAtom = makeLabelAtom(makeLabel({ id: "b" }));
    store.set(editingLabelAtom, labelAtom);

    const { result } = renderHook(() => useAnnotationContext());
    expect(result.current.isEditingAtom(otherAtom)).toBe(false);
  });

  it("returns false when no label is being edited", () => {
    const labelAtom = makeLabelAtom(makeLabel());
    const { result } = renderHook(() => useAnnotationContext());
    expect(result.current.isEditingAtom(labelAtom)).toBe(false);
  });

  it("sees writes performed after the hook was rendered (fresh comparison)", () => {
    const labelAtom = makeLabelAtom(makeLabel());

    const { result } = renderHook(() => useAnnotationContext());
    // Comparison happens at call time, not at render time.
    expect(result.current.isEditingAtom(labelAtom)).toBe(false);

    act(() => {
      store.set(editingLabelAtom, labelAtom);
    });

    expect(result.current.isEditingAtom(labelAtom)).toBe(true);
  });
});

describe("useAnnotationContext.readSelected", () => {
  it("returns a fresh snapshot reflecting writes after the hook rendered", () => {
    const { result } = renderHook(() => useAnnotationContext());
    expect(result.current.readSelected().label).toBe(null);

    const labelAtom = makeLabelAtom(makeLabel({ id: "fresh" }));
    act(() => {
      store.set(editingLabelAtom, labelAtom);
    });

    expect(result.current.readSelected().label?.data._id).toBe("fresh");
  });

  it("reflects pendingNewType when it's the only thing set", () => {
    const { result } = renderHook(() => useAnnotationContext());
    act(() => {
      store.set(pendingNewTypeAtom, "Polyline");
    });
    expect(result.current.readSelected().pendingNewType).toBe("Polyline");
  });
});

describe("useAnnotationContext.lastUsed", () => {
  it("recordField + fieldFor round-trip per type", () => {
    const { result } = renderHook(() => useAnnotationContext());
    act(() => {
      result.current.lastUsed.recordField("Detection", "ground_truth");
      result.current.lastUsed.recordField("Polyline", "lines");
    });

    expect(result.current.lastUsed.fieldFor("Detection")).toBe("ground_truth");
    expect(result.current.lastUsed.fieldFor("Polyline")).toBe("lines");
  });

  it("recordLabel + labelFor round-trip per field", () => {
    const { result } = renderHook(() => useAnnotationContext());
    act(() => {
      result.current.lastUsed.recordLabel("predictions", "dog");
    });

    expect(result.current.lastUsed.labelFor("predictions")).toBe("dog");
  });
});

describe("useAnnotationContext.setData", () => {
  it("merges into the current label's data by default", () => {
    const labelAtom = makeLabelAtom(
      makeLabel({ id: "abc", data: { label: "cat" } })
    );
    store.set(editingLabelAtom, labelAtom);

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.setData({ label: "dog" }));

    expect(store.get(labelAtom).data).toMatchObject({
      _id: "abc",
      label: "dog",
    });
  });

  it("replaces the data wholesale when options.replace is true", () => {
    const labelAtom = makeLabelAtom(
      makeLabel({ id: "abc", data: { label: "cat", confidence: 0.9 } })
    );
    store.set(editingLabelAtom, labelAtom);

    const { result } = renderHook(() => useAnnotationContext());
    act(() =>
      result.current.setData(
        { _id: "abc", label: "dog" } as AnnotationLabel["data"],
        { replace: true }
      )
    );

    expect(store.get(labelAtom).data).toEqual({
      _id: "abc",
      label: "dog",
    });
  });
});

describe("useAnnotationContext mutual exclusion (editingLabel ↔ pendingNewType)", () => {
  it("select() while a pendingNewType is set wins — pending is cleared", () => {
    store.set(pendingNewTypeAtom, "Detection");
    const labelAtom = makeLabelAtom(makeLabel());

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.select(labelAtom));

    expect(store.get(editingLabelAtom)).toBe(labelAtom);
    expect(store.get(pendingNewTypeAtom)).toBe(null);
  });

  it("clear() drops both editingLabel and pendingNewType", () => {
    store.set(pendingNewTypeAtom, "Detection");
    store.set(editingLabelAtom, makeLabelAtom(makeLabel()));

    const { result } = renderHook(() => useAnnotationContext());
    act(() => result.current.clear());

    expect(store.get(editingLabelAtom)).toBe(null);
    expect(store.get(pendingNewTypeAtom)).toBe(null);
  });
});
