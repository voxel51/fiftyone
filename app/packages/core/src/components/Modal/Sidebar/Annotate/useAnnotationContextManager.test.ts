import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ListSchemasResponse } from "./useSchemaManager";

const mockListSchemas = vi.fn();
const mockInitializeSchema = vi.fn();
const mockActivateSchemas = vi.fn();
let mockCanManageSchema = true;

const emptyListResponse: ListSchemasResponse = {
  active_label_schemas: [],
  label_schemas: {},
};

const listResponseWithSchema = (field: string): ListSchemasResponse => ({
  active_label_schemas: [field],
  label_schemas: {
    [field]: {
      default_label_schema: { type: "str", component: "text" },
      read_only: false,
      type: "Classification",
      unsupported: false,
      label_schema: { type: "str", component: "text" },
    },
  },
});

// Shared mock store for jotaiStore.get()
let mockMgmtOps: {
  initializeSchema: typeof mockInitializeSchema;
  activateSchemas: typeof mockActivateSchemas;
} | null = null;

// mocked whole (no importOriginal): the real package's graph re-enters core,
// and this module only needs the contract enum + the entrance-label setter
vi.mock("@fiftyone/annotation", () => ({
  InitializationStatus: {
    InsufficientPermissions: 0,
    ServerError: 1,
    Success: 2,
  },
  useSetEntranceLabel: () => vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  DefaultContextManager: vi.fn(() => ({
    isActive: () => false,
    enter: vi.fn(),
    exit: vi.fn(),
    registerExitCallback: vi.fn(),
  })),
  useActiveModalFields: () => [[], vi.fn()],
  useModalSample: () => ({ sample: { _id: "test-sample-id" } }),
  useQueryPerformanceSampleLimit: () => 1000,
  useUnboundStateRef: (val: unknown) => ({ current: val }),
}));

vi.mock("@fiftyone/state/src/jotai", () => ({
  jotaiStore: {
    get: vi.fn(() => mockMgmtOps),
  },
}));

vi.mock("./Edit/useActivePrimitive", () => ({
  usePrimitiveController: () => ({
    isPrimitive: vi.fn().mockReturnValue(false),
    setActivePrimitive: vi.fn(),
  }),
}));

vi.mock("./Edit/useSave", () => ({
  default: () => vi.fn(),
}));

vi.mock("./state", () => ({
  useAnnotationSchemaContext: () => ({
    setLabelSchema: vi.fn(),
    setActiveSchemaPaths: vi.fn(),
  }),
}));

vi.mock("./useCanManageSchema", () => ({
  default: vi.fn(() => mockCanManageSchema),
}));

vi.mock("./useDeactivateAllModes", () => ({
  useDeactivateAllModes: () => vi.fn(),
}));

vi.mock("./useSchemaResolver", async () => {
  const { atom } = await import("jotai");

  return {
    schemaManagementOpsAtom: atom(null),
    useSchemaResolver: () => ({
      listSchemas: mockListSchemas,
    }),
  };
});

const { useAnnotationContextManager, InitializationStatus } =
  await import("./useAnnotationContextManager");

describe("activateField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageSchema = true;
    mockListSchemas.mockResolvedValue(emptyListResponse);
    mockInitializeSchema.mockResolvedValue({ label_schema: {} });
    mockActivateSchemas.mockResolvedValue({});
    mockMgmtOps = {
      initializeSchema: mockInitializeSchema,
      activateSchemas: mockActivateSchemas,
    };
  });

  it.each([
    [
      "canManageSchema is false",
      () => {
        mockCanManageSchema = false;
      },
    ],
    [
      "mgmtOps is null",
      () => {
        mockMgmtOps = null;
      },
    ],
  ])(
    "returns InsufficientPermissions when %s",
    async (_label, setupOverride) => {
      setupOverride();
      const { result } = renderHook(() => useAnnotationContextManager());

      let enterResult: { status: number };
      await act(async () => {
        enterResult = await result.current.activateField("ground_truth");
      });

      expect(enterResult!.status).toBe(
        InitializationStatus.InsufficientPermissions,
      );
      expect(mockListSchemas).not.toHaveBeenCalled();
      expect(mockInitializeSchema).not.toHaveBeenCalled();
      expect(mockActivateSchemas).not.toHaveBeenCalled();
    },
  );

  it("uses schemaResolver for reads and mgmtOps for writes", async () => {
    const { result } = renderHook(() => useAnnotationContextManager());

    await act(async () => {
      await result.current.activateField("predictions");
    });

    // read ops: listSchemas called twice (check + refresh)
    expect(mockListSchemas).toHaveBeenCalledTimes(2);

    // write ops: initialize (new field) + activate
    expect(mockInitializeSchema).toHaveBeenCalledWith({
      field: "predictions",
      scan_samples: true,
      limit: 1000,
    });
    expect(mockActivateSchemas).toHaveBeenCalledWith({
      fields: ["predictions"],
    });
  });

  it("skips initializeSchema when field already has a schema", async () => {
    mockListSchemas.mockResolvedValue(listResponseWithSchema("ground_truth"));

    const { result } = renderHook(() => useAnnotationContextManager());

    await act(async () => {
      await result.current.activateField("ground_truth");
    });

    expect(mockInitializeSchema).not.toHaveBeenCalled();
    expect(mockActivateSchemas).toHaveBeenCalledWith({
      fields: ["ground_truth"],
    });
  });

  it("returns ServerError when a write operation fails", async () => {
    mockInitializeSchema.mockRejectedValue(new Error("forbidden"));

    const { result } = renderHook(() => useAnnotationContextManager());

    let enterResult: { status: number; message?: string };
    await act(async () => {
      enterResult = await result.current.activateField("predictions");
    });

    expect(enterResult!.status).toBe(InitializationStatus.ServerError);
    expect(enterResult!.message).toBe("forbidden");
  });
});
