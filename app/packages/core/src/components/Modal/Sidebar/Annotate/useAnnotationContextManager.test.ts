import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ListSchemasResponse } from "./useSchemaManager";

const mockListSchemas = vi.fn();
const mockInitializeSchema = vi.fn();
const mockActivateSchemas = vi.fn();
const mockSetLabelSchema = vi.fn();
const mockSetActiveSchemaPaths = vi.fn();
let mockCanManageSchema = true;

// stand-ins for the schema atoms, read through jotaiStore.get()
const LABEL_SCHEMAS_ATOM = { atom: "labelSchemasData" };
const ACTIVE_SCHEMAS_ATOM = { atom: "activeLabelSchemas" };
const SCHEMA_DATASET_ATOM = { atom: "schemaDatasetName" };
let mockSchemaDataset: string | null = "quickstart";
let mockLoadedSchemas: ListSchemasResponse["label_schemas"] | null = null;
let mockLoadedActivePaths: string[] | null = null;

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
  DefaultContextManager: vi.fn(function () {
    return {
      isActive: () => false,
      enter: vi.fn(),
      exit: vi.fn(),
      registerExitCallback: vi.fn(),
    };
  }),
  useActiveModalFields: () => [[], vi.fn()],
  useModalSample: () => ({ sample: { _id: "test-sample-id" } }),
  useQueryPerformanceSampleLimit: () => 1000,
  useUnboundStateRef: (val: unknown) => ({ current: val }),
}));

vi.mock("@fiftyone/state/src/jotai", () => ({
  jotaiStore: {
    get: vi.fn((atom: unknown) => {
      if (atom === LABEL_SCHEMAS_ATOM) return mockLoadedSchemas;
      if (atom === ACTIVE_SCHEMAS_ATOM) return mockLoadedActivePaths;
      if (atom === SCHEMA_DATASET_ATOM) return mockSchemaDataset;
      return mockMgmtOps;
    }),
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
  activeLabelSchemas: ACTIVE_SCHEMAS_ATOM,
  labelSchemasData: LABEL_SCHEMAS_ATOM,
  schemaDatasetName: SCHEMA_DATASET_ATOM,
  useAnnotationSchemaContext: () => ({
    setLabelSchema: mockSetLabelSchema,
    setActiveSchemaPaths: mockSetActiveSchemaPaths,
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
    mockLoadedSchemas = null;
    mockLoadedActivePaths = null;
    mockSchemaDataset = "quickstart";
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

  it("puts the loaded schemas back when activation fails", async () => {
    // nothing else refills the atoms on this dataset once they are cleared
    const loaded = listResponseWithSchema("ground_truth");
    mockLoadedSchemas = loaded.label_schemas;
    mockLoadedActivePaths = loaded.active_label_schemas;
    mockActivateSchemas.mockRejectedValue(new Error("forbidden"));

    const { result } = renderHook(() => useAnnotationContextManager());

    await act(async () => {
      await result.current.activateField("predictions");
    });

    expect(mockSetLabelSchema.mock.calls).toEqual([
      [null],
      [loaded.label_schemas],
    ]);
    expect(mockSetActiveSchemaPaths.mock.calls).toEqual([
      [null],
      [loaded.active_label_schemas],
    ]);
  });

  it("does not restore another dataset's schemas after a switch", async () => {
    mockLoadedSchemas = listResponseWithSchema("ground_truth").label_schemas;
    mockLoadedActivePaths = ["ground_truth"];
    mockActivateSchemas.mockImplementation(async () => {
      // the user switches datasets while activation is in flight
      mockSchemaDataset = "other-dataset";
      throw new Error("forbidden");
    });

    const { result } = renderHook(() => useAnnotationContextManager());

    await act(async () => {
      await result.current.activateField("predictions");
    });

    expect(mockSetLabelSchema.mock.calls).toEqual([[null]]);
    expect(mockSetActiveSchemaPaths.mock.calls).toEqual([[null]]);
  });

  it("sets the refreshed schemas when activation succeeds", async () => {
    mockLoadedSchemas = {};
    mockLoadedActivePaths = [];
    const refreshed = listResponseWithSchema("predictions");
    mockListSchemas
      .mockResolvedValueOnce(emptyListResponse)
      .mockResolvedValueOnce(refreshed);

    const { result } = renderHook(() => useAnnotationContextManager());

    await act(async () => {
      await result.current.activateField("predictions");
    });

    expect(mockSetLabelSchema).toHaveBeenLastCalledWith(
      refreshed.label_schemas,
    );
    expect(mockSetActiveSchemaPaths).toHaveBeenLastCalledWith(
      refreshed.active_label_schemas,
    );
  });
});
