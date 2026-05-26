/**
 * Shared test helpers for annotation-edit hook tests.
 *
 * Test files still need to declare their own `vi.mock(...)` calls (vitest
 * hoists those per-file and they can't live in a helper), but the *bodies*
 * of those mocks — the stub shapes, factories, and the recoil partial-mock
 * pattern — can be shared.
 *
 * Typical usage:
 *
 * ```ts
 * // @vitest-environment jsdom
 * import { vi } from "vitest";
 * import {
 *   createMockAnnotationContext,
 *   createMockScene,
 *   recoilPartialMock,
 * } from "./__testing__/mocks";
 *
 * let annotationContext = createMockAnnotationContext();
 * const scene = createMockScene();
 *
 * vi.mock("recoil", recoilPartialMock);
 * vi.mock("@fiftyone/lighter", () => ({ useLighter: () => ({ scene }) }));
 * vi.mock("./useAnnotationContext", () => ({
 *   useAnnotationContext: () => annotationContext,
 *   useAnnotationFields: () => ({ fields: [] }),
 * }));
 * ```
 */

import { vi } from "vitest";

// ---- annotationContext stub -------------------------------------------------

export interface MockAnnotationContextSelected {
  label: { type: string; data: Record<string, unknown> } | null;
  data: Record<string, unknown> | null;
  field: string | null;
  type: string | null;
  overlay: unknown;
  schema: unknown;
  savedData: Record<string, unknown> | null;
  isEditing: boolean;
  isEditingMask: boolean;
  isNew: boolean;
  hasChanges: boolean;
  isFieldReadOnly: boolean;
  pendingNewType: string | null;
}

export interface MockAnnotationContext {
  selected: MockAnnotationContextSelected;
  setData: ReturnType<typeof vi.fn>;
  setField: ReturnType<typeof vi.fn>;
  setSavedData: ReturnType<typeof vi.fn>;
  setEditingMask: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  createNew: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  isEditingAtom: ReturnType<typeof vi.fn>;
  lastUsed: {
    fieldFor: ReturnType<typeof vi.fn>;
    labelFor: ReturnType<typeof vi.fn>;
    recordField: ReturnType<typeof vi.fn>;
    recordLabel: ReturnType<typeof vi.fn>;
  };
}

const defaultSelected: MockAnnotationContextSelected = {
  label: null,
  data: null,
  field: null,
  type: null,
  overlay: undefined,
  schema: null,
  savedData: null,
  isEditing: false,
  isEditingMask: false,
  isNew: false,
  hasChanges: false,
  isFieldReadOnly: false,
  pendingNewType: null,
};

/**
 * Factory for a fully-stubbed AnnotationContext value. All actions are
 * `vi.fn()` so individual tests can assert on calls. Pass `overrides.selected`
 * to override individual selected fields without restating the whole object.
 */
export const createMockAnnotationContext = (overrides?: {
  selected?: Partial<MockAnnotationContextSelected>;
  setData?: ReturnType<typeof vi.fn>;
  setField?: ReturnType<typeof vi.fn>;
  setSavedData?: ReturnType<typeof vi.fn>;
  setEditingMask?: ReturnType<typeof vi.fn>;
  select?: ReturnType<typeof vi.fn>;
  createNew?: ReturnType<typeof vi.fn>;
  clear?: ReturnType<typeof vi.fn>;
  isEditingAtom?: ReturnType<typeof vi.fn>;
}): MockAnnotationContext => ({
  selected: { ...defaultSelected, ...overrides?.selected },
  setData: overrides?.setData ?? vi.fn(),
  setField: overrides?.setField ?? vi.fn(),
  setSavedData: overrides?.setSavedData ?? vi.fn(),
  setEditingMask: overrides?.setEditingMask ?? vi.fn(),
  select: overrides?.select ?? vi.fn(),
  createNew: overrides?.createNew ?? vi.fn(),
  clear: overrides?.clear ?? vi.fn(),
  isEditingAtom: overrides?.isEditingAtom ?? vi.fn().mockReturnValue(false),
  lastUsed: {
    fieldFor: vi.fn().mockReturnValue(null),
    labelFor: vi.fn().mockReturnValue(null),
    recordField: vi.fn(),
    recordLabel: vi.fn(),
  },
});

// ---- lighter scene stub -----------------------------------------------------

export interface MockScene {
  exitInteractiveMode: ReturnType<typeof vi.fn>;
  isDestroyed: boolean;
  renderLoopActive: boolean;
  getEventChannel: () => string;
  [key: string]: unknown;
}

/**
 * Factory for a stub lighter scene. Override any field via `overrides`; the
 * remainder fall through to sensible defaults (alive, render-loop active,
 * stable event channel).
 */
export const createMockScene = (overrides?: Partial<MockScene>): MockScene => ({
  exitInteractiveMode: vi.fn(),
  isDestroyed: false,
  renderLoopActive: true,
  getEventChannel: () => "test-channel",
  ...overrides,
});

// ---- recoil partial-mock factory --------------------------------------------

/**
 * Use as the second argument to `vi.mock("recoil", ...)`. Preserves the
 * real recoil exports (most importantly `atom`, which the analytics package
 * imports at module-load time) while stubbing `useRecoilValue` to a no-op
 * returning `false`. Override `useRecoilValue` per-test by re-mocking it
 * via vi.mocked(...) if needed.
 *
 * Required because a bare `vi.mock("recoil", () => ({ useRecoilValue }))`
 * strips `atom` and breaks anything in the transitive graph that imports it
 * — most notably `@fiftyone/analytics`.
 */
export const recoilPartialMock = async (
  importOriginal: () => Promise<typeof import("recoil")>
) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRecoilValue: () => false,
  };
};
