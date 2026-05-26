// Stub factories for annotation-edit hook tests. The vi.mock declarations
// themselves still live in each test file (vitest hoists them per-file),
// but the shapes they return come from here.
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

/** Stubbed AnnotationContext. All actions are `vi.fn()` for assertion. */
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

/** Stub lighter scene with sensible defaults (alive, render-loop active). */
export const createMockScene = (overrides?: Partial<MockScene>): MockScene => ({
  exitInteractiveMode: vi.fn(),
  isDestroyed: false,
  renderLoopActive: true,
  getEventChannel: () => "test-channel",
  ...overrides,
});

// ---- recoil partial-mock factory --------------------------------------------

/**
 * Partial mock for `vi.mock("recoil", ...)`. Preserves the real exports
 * (notably `atom`, which `@fiftyone/analytics` imports at module-load time)
 * while stubbing `useRecoilValue` to return `false`. Without this, a bare
 * mock that strips `atom` crashes anything analytics-adjacent.
 */
export const recoilPartialMock = async (
  importOriginal: () => Promise<typeof import("recoil")>
) => ({
  ...(await importOriginal()),
  useRecoilValue: () => false,
});
