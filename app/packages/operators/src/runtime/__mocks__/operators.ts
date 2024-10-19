export const mockExecutionContext = {
  params: {},
  _currentContext: {
    datasetName: "mockDataset",
    view: "mockView",
    extended: false,
    filters: {},
    selectedSamples: new Set(),
    selectedLabels: [],
    currentSample: "mockSample",
    viewName: "mockViewName",
    extendedSelection: { selection: null, scope: "" },
    groupSlice: "mockGroupSlice",
    state: {},
    analyticsInfo: { id: "mockAnalytics" },
  },
  hooks: {},
  executor: null,
};

// Mock the ExecutionContext class
export class ExecutionContext {
  constructor(params = {}, currentContext = {}, hooks = {}) {
    Object.assign(this, { params, _currentContext: currentContext, hooks });
  }

  trigger() {}
  log() {}
}

// Mock the OperatorResult class
export class OperatorResult {
  constructor(
    public operator,
    public result = {},
    public executor = null,
    public error = "",
    public delegated = false
  ) {}

  hasOutputContent() {
    return !!(this.result || this.error);
  }

  toJSON() {
    return {
      result: this.result,
      error: this.error,
      executor: this.executor,
    };
  }
}

// Mock function for resolveExecutionOptions
export async function resolveExecutionOptions(operatorURI, ctx) {
  return {
    orchestratorRegistrationEnabled: false,
    allowImmediateExecution: true,
    allowDelegatedExecution: false,
    availableOrchestrators: [],
    defaultChoiceToDelegated: false,
  };
}

// Mock function for executeOperatorWithContext
export async function executeOperatorWithContext(uri, ctx) {
  return new OperatorResult(
    { name: "mockOperator" },
    { mockResult: "result" },
    null,
    "",
    false
  );
}

// Mock function for getLocalOrRemoteOperator
export function getLocalOrRemoteOperator(operatorURI) {
  return { operator: { uri: operatorURI, isRemote: false }, isRemote: false };
}
