import { act, renderHook } from "@testing-library/react";
import React, { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorSurface } from "./constants";
import {
  OperatorExecutionOption,
  assertOnSurface,
  getActiveSurface,
  isOnSurface,
  setActiveSurface,
  useOperatorPromptSubmitOptions,
  useSetActiveSurface,
} from "./state";

vi.mock("recoil", () => ({
  atom: vi.fn(() => ({ key: "mocked-atom" })),
  selector: vi.fn(() => ({ key: "mocked-selector" })),
  selectorFamily: vi.fn(() => () => ({ key: "mocked-selector-family" })),
  useRecoilCallback: vi.fn(),
  useRecoilState: vi.fn(() => [null, vi.fn()]),
  useRecoilTransaction_UNSTABLE: vi.fn(),
  useRecoilValue: vi.fn(),
  useRecoilValueLoadable: vi.fn(),
  useSetRecoilState: vi.fn(),
}));

vi.mock("@fiftyone/analytics", () => ({
  useAnalyticsInfo: vi.fn(),
}));

vi.mock("@fiftyone/components", async () => {
  return {
    Markdown: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});

vi.mock("@fiftyone/state", async () => {
  return {
    useBrowserStorage: (_key: string, defaultValue: unknown) =>
      useState(defaultValue),
    useNotification: vi.fn(() => vi.fn()),
    getBrowserStorageEffectForKey: vi.fn(() => () => {}),
    modal: null,
    datasetName: null,
    view: null,
    extendedStages: null,
    filters: null,
    selectedSamples: null,
    selectedLabels: null,
    viewName: null,
    extendedSelection: null,
    groupSlice: null,
    queryPerformance: null,
    sessionSpaces: null,
    activeFields: vi.fn(() => null),
    currentSampleId: null,
    editingFieldAtom: null,
  };
});

vi.mock("./operators", () => ({
  ExecutionContext: vi.fn().mockImplementation(() => ({})),
  InvocationRequestQueue: vi.fn(),
  OperatorResult: vi.fn(),
  executeOperatorWithContext: vi.fn(),
  getInvocationRequestQueue: vi.fn(),
  getLocalOrRemoteOperator: vi.fn(() => ({ operator: {}, isRemote: false })),
  listLocalAndRemoteOperators: vi.fn(),
  resolveExecutionOptions: vi.fn(),
  resolveOperatorURI: vi.fn(),
}));

vi.mock("./utils", () => ({
  generateOperatorSessionId: vi.fn(() => "test-session-id"),
  optimizeCtx: vi.fn((ctx: unknown) => ctx),
  stringifyError: vi.fn(),
  onEnter: vi.fn((fn: unknown) => fn),
}));

vi.mock("./validation", () => ({
  ValidationContext: vi.fn(),
}));

describe("isOnSurface", () => {
  const GRID = OperatorSurface.DATASET_SAMPLES_GRID;
  const MODAL = OperatorSurface.DATASET_SAMPLE_MODAL;

  it("includes an operator declared on the surface", () => {
    expect(isOnSurface([GRID, MODAL], MODAL)).toBe(true);
    expect(isOnSurface([GRID], GRID)).toBe(true);
  });

  it("excludes an operator not declared on the surface", () => {
    expect(isOnSurface([GRID], MODAL)).toBe(false);
    expect(isOnSurface([MODAL], GRID)).toBe(false);
  });

  it("excludes an operator that declares no surfaces", () => {
    expect(isOnSurface([], GRID)).toBe(false);
    expect(isOnSurface([], MODAL)).toBe(false);
  });

  it("includes an operator with undeclared surfaces, rather than hiding it", () => {
    expect(isOnSurface(undefined, GRID)).toBe(true);
    expect(isOnSurface(undefined, MODAL)).toBe(true);
  });

  it("includes an operator declared on all surfaces", () => {
    expect(isOnSurface([OperatorSurface.ALL], GRID)).toBe(true);
    expect(isOnSurface([OperatorSurface.ALL], MODAL)).toBe(true);
  });
});

describe("assertOnSurface", () => {
  const GRID = OperatorSurface.DATASET_SAMPLES_GRID;
  const MODAL = OperatorSurface.DATASET_SAMPLE_MODAL;
  const URI = "@voxel51/operators/example";

  it("does not throw when the operator declares the surface", () => {
    expect(() => assertOnSurface(URI, [GRID, MODAL], MODAL)).not.toThrow();
  });

  it("does not throw when the operator declares no surfaces", () => {
    expect(() => assertOnSurface(URI, undefined, MODAL)).not.toThrow();
  });

  it("throws when the operator is not available on the surface", () => {
    expect(() => assertOnSurface(URI, [GRID], MODAL)).toThrow();
  });

  it("names the operator in the error", () => {
    expect(() => assertOnSurface(URI, [GRID], MODAL)).toThrow(
      `Operator "${URI}" is not supported on this surface`,
    );
  });
});

describe("activeSurface", () => {
  beforeEach(() => {
    setActiveSurface(OperatorSurface.DATASET_SAMPLES_GRID);
  });

  it("defaults to the grid surface", () => {
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);
  });

  it("returns the surface that was last set", () => {
    setActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL);
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);
  });

  it("is shared globally, so a set is visible to every reader", () => {
    setActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL);
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);
  });
});

describe("useSetActiveSurface", () => {
  beforeEach(() => {
    setActiveSurface(OperatorSurface.DATASET_SAMPLES_GRID);
  });

  it("activates the given surface on mount", () => {
    renderHook(() => useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL));
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);
  });

  it("restores the previous surface on unmount when restore is true", () => {
    const { unmount } = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL, true),
    );
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);

    unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);
  });

  it("leaves the surface in place on unmount when restore is false", () => {
    const { unmount } = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL, false),
    );
    unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);
  });

  it("does not restore by default", () => {
    const { unmount } = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL),
    );
    unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);
  });

  it("restores whatever was active at mount, not the default", () => {
    setActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL);
    const { unmount } = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLES_GRID, true),
    );
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);

    unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);
  });

  it("does not touch the surface when it is already active", () => {
    setActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL);
    const { unmount } = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL, true),
    );
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);

    unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);
  });

  it("survives a double mount of the same surface unmounting out of order", () => {
    // first declaration owns the transition grid -> modal
    const first = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL, true),
    );
    // second declares the surface that is already active, so it owns nothing
    const second = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL, true),
    );
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);

    // unmounting out of order must not strand the surface on modal
    first.unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);

    second.unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);
  });

  it("restores once when the same surface is declared twice", () => {
    const first = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL, true),
    );
    const second = renderHook(() =>
      useSetActiveSurface(OperatorSurface.DATASET_SAMPLE_MODAL, true),
    );

    second.unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);

    first.unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);
  });

  it("re-activates and restores across a surface change", () => {
    const { rerender, unmount } = renderHook(
      ({ surface }) => useSetActiveSurface(surface, true),
      { initialProps: { surface: OperatorSurface.DATASET_SAMPLE_MODAL } },
    );
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLE_MODAL);

    rerender({ surface: OperatorSurface.DATASET_SAMPLES_GRID });
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);

    unmount();
    expect(getActiveSurface()).toBe(OperatorSurface.DATASET_SAMPLES_GRID);
  });
});

describe("useOperatorPromptSubmitOptions", () => {
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExecute = vi.fn();
    vi.clearAllMocks();
  });

  it("returns no options when there are no applicable execution modes", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowDelegatedExecution: true,
          orchestratorRegistrationEnabled: true,
          availableOrchestrators: [],
          allowImmediateExecution: false,
        }),
        mockExecute,
      ),
    );
    expect(result.current.hasOptions).toBe(false);
    expect(result.current.options).toHaveLength(0);
  });

  it("includes the execute option when allowImmediateExecution is true", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({ allowImmediateExecution: true }),
        mockExecute,
      ),
    );
    expect(result.current.hasOptions).toBe(true);
    expect(result.current.options).toHaveLength(1);
    const [opt] = result.current.options;
    expect(opt.id).toBe("execute");
    expect(opt.label).toBe("Execute");
    expect(opt.isDelegated).toBe(false);
  });

  it("uses provided label as the execute option label", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({ allowImmediateExecution: true }),
        mockExecute,
        { submitButtonLabel: "Run Now" },
      ),
    );
    expect(result.current.options[0].label).toBe("Run Now");
  });

  it("uses operator provided label as the execute option label", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({ allowImmediateExecution: true }),
        mockExecute,
        { submit_button_label: "Run!" },
      ),
    );
    expect(result.current.options[0].label).toBe("Run!");
  });

  it("includes a schedule option when allowDelegatedExecution is true and orchestratorRegistrationEnabled is false", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({ allowDelegatedExecution: true }),
        mockExecute,
      ),
    );
    expect(result.current.options).toHaveLength(1);
    const [opt] = result.current.options;
    expect(opt.id).toBe("schedule");
    expect(opt.isDelegated).toBe(true);
  });

  it("includes both execute and schedule when both modes are allowed (no orchestrator registration)", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          allowDelegatedExecution: true,
        }),
        mockExecute,
      ),
    );
    expect(result.current.options).toHaveLength(2);
    const ids = result.current.options.map((o) => o.id);
    expect(ids).toContain("execute");
    expect(ids).toContain("schedule");
  });

  it("puts the execute option first when defaultChoiceToDelegated is false", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          allowDelegatedExecution: true,
          defaultChoiceToDelegated: false,
        }),
        mockExecute,
      ),
    );
    expect(result.current.options[0].id).toBe("execute");
  });

  it("puts the schedule option first when defaultChoiceToDelegated is true", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          allowDelegatedExecution: true,
          defaultChoiceToDelegated: true,
        }),
        mockExecute,
      ),
    );
    expect(result.current.options[0].id).toBe("schedule");
  });

  it("creates per-orchestrator schedule options when orchestrators are available", () => {
    const orchestrators = [
      { id: "orc-1", instanceID: "worker-1" },
      { id: "orc-2", instanceID: "worker-2" },
    ];
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          allowDelegatedExecution: true,
          orchestratorRegistrationEnabled: true,
          availableOrchestrators: orchestrators,
        }),
        mockExecute,
      ),
    );
    expect(result.current.options).toHaveLength(3);
    const orcOpts = result.current.options.filter((o) => o.isDelegated);
    expect(orcOpts).toHaveLength(2);
    expect(orcOpts[0].id).toBe("orc-1");
    expect(orcOpts[0].choiceLabel).toBe("Schedule on worker-1");
    expect(orcOpts[1].id).toBe("orc-2");
    expect(orcOpts[1].choiceLabel).toBe("Schedule on worker-2");
  });

  it("adds a disabled-schedule option when orchestrator registration is enabled but no orchestrators exist", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          allowDelegatedExecution: true,
          orchestratorRegistrationEnabled: true,
          availableOrchestrators: [],
        }),
        mockExecute,
      ),
    );
    const disabledOption = result.current.options.find(
      (o) => o.id === "disabled-schedule",
    ) as OperatorExecutionOption;
    expect(disabledOption).toBeDefined();
    expect(disabledOption.isDisabledSchedule).toBe(true);
    expect(disabledOption.tag).toBe("NOT AVAILABLE");
  });

  it("sets requiresOrchestratorSetup to true when orchestrator is required but not available", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowDelegatedExecution: true,
          orchestratorRegistrationEnabled: true,
          availableOrchestrators: [],
          allowImmediateExecution: false,
        }),
        mockExecute,
      ),
    );
    expect(result.current.requiresOrchestratorSetup).toBe(true);
  });

  it("sets requiresOrchestratorSetup to false when allowImmediateExecution is true", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          allowDelegatedExecution: true,
          orchestratorRegistrationEnabled: true,
          availableOrchestrators: [],
        }),
        mockExecute,
      ),
    );
    expect(result.current.requiresOrchestratorSetup).toBe(false);
  });

  it("sets requiresOrchestratorSetup to false when orchestrators are available", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowDelegatedExecution: true,
          orchestratorRegistrationEnabled: true,
          availableOrchestrators: [{ id: "orc-1", instanceID: "worker-1" }],
        }),
        mockExecute,
      ),
    );
    expect(result.current.requiresOrchestratorSetup).toBe(false);
  });

  it("sets isLoading to true when execDetails is loading", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          isLoading: true,
        }),
        mockExecute,
      ),
    );
    expect(result.current.isLoading).toBe(true);
  });

  it("sets isLoading to false when execDetails is not loading", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          isLoading: false,
        }),
        mockExecute,
      ),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it("calls execute without args when the execute option is selected", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({ allowImmediateExecution: true }),
        mockExecute,
      ),
    );
    act(() => {
      result.current.handleSubmit();
    });
    expect(mockExecute).toHaveBeenCalledWith();
  });

  it("calls execute with requestDelegation when the schedule option is selected", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowDelegatedExecution: true,
          defaultChoiceToDelegated: true,
        }),
        mockExecute,
      ),
    );
    act(() => {
      result.current.handleSubmit();
    });
    expect(mockExecute).toHaveBeenCalledWith({ requestDelegation: true });
  });

  it("calls execute with delegationTarget when an orchestrator option is selected", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowDelegatedExecution: true,
          orchestratorRegistrationEnabled: true,
          availableOrchestrators: [{ id: "orc-1", instanceID: "worker-1" }],
        }),
        mockExecute,
      ),
    );
    act(() => {
      result.current.handleSubmit();
    });
    expect(mockExecute).toHaveBeenCalledWith({
      delegationTarget: "worker-1",
      requestDelegation: true,
    });
  });

  it("marks the currently selected option with selected:true", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({ allowImmediateExecution: true }),
        mockExecute,
      ),
    );
    const selected = result.current.options.filter((o) => o.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("execute");
  });

  it("updates the selected option when onSelect is called", () => {
    const { result } = renderHook(() =>
      useOperatorPromptSubmitOptions(
        OPERATOR_URI,
        createMockExecDetails({
          allowImmediateExecution: true,
          allowDelegatedExecution: true,
          defaultChoiceToDelegated: false,
        }),
        mockExecute,
      ),
    );

    // Initially execute is selected (first / default)
    expect(result.current.options[0].selected).toBe(true);
    expect(result.current.options[0].id).toBe("execute");

    // Switch selection to schedule
    act(() => {
      result.current.options.find((o) => o.id === "schedule")?.onSelect?.();
    });

    expect(
      result.current.options.find((o) => o.id === "schedule")?.selected,
    ).toBe(true);
    expect(
      result.current.options.find((o) => o.id === "execute")?.selected,
    ).toBeUndefined();
  });
});

const OPERATOR_URI = "test/operator";

function createMockExecDetails(opts: ExecutionOptions = {}) {
  const { isLoading = false, ...executionOptions } = opts;
  return { isLoading, executionOptions };
}

type ExecutionOptions = {
  allowImmediateExecution?: boolean;
  allowDelegatedExecution?: boolean;
  defaultChoiceToDelegated?: boolean;
  orchestratorRegistrationEnabled?: boolean;
  availableOrchestrators?: Array<{ id: string; instanceID: string }>;
  isLoading?: boolean;
};
