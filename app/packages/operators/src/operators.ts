import { AnalyticsInfo, usingAnalytics } from "@fiftyone/analytics";
import { SpaceNode, spaceNodeFromJSON, SpaceNodeJSON } from "@fiftyone/spaces";
import { getFetchFunction, isNullish, ServerError } from "@fiftyone/utilities";
import { CallbackInterface } from "recoil";
import { QueueItemStatus } from "./constants";
import * as types from "./types";
import { ExecutionCallback, OperatorExecutorOptions } from "./types-internal";
import { stringifyError } from "./utils";
import { ValidationContext, ValidationError } from "./validation";

type RawInvocationRequest = {
  operator_uri?: string;
  operator_name?: string;
  params: object;
  options: object;
};

class InvocationRequest {
  constructor(
    public operatorURI: string,
    public params: unknown = {},
    public options?: OperatorExecutorOptions
  ) {}
  static fromJSON(json: RawInvocationRequest): InvocationRequest {
    return new InvocationRequest(
      json.operator_uri || json.operator_name,
      json.params,
      json.options
    );
  }
  toJSON() {
    return {
      operatorURI: this.operatorURI,
      params: this.params,
      options: this.options,
    };
  }
}

export class Executor {
  constructor(public requests: InvocationRequest[], public logs: string[]) {
    this.requests = requests || [];
    this.logs = logs || [];
  }
  queueRequests() {
    const requests = this.requests;
    if (requests.length === 0) {
      return;
    }
    const queue = getInvocationRequestQueue();
    for (const request of requests) {
      queue.add(request);
    }
  }
  static fromJSON(json: { requests: RawInvocationRequest[]; logs: string[] }) {
    return new Executor(
      json.requests.map((r: any) => InvocationRequest.fromJSON(r)),
      json.logs
    );
  }
  trigger(operatorURI: string, params: object = {}) {
    operatorURI = resolveOperatorURI(operatorURI);
    this.requests.push(new InvocationRequest(operatorURI, params));
  }
  log(message: string) {
    this.logs.push(message);
  }
}

class Panel {
  constructor(public id: string) {}
  static fromJSON(json: any) {
    return new Panel(json.id);
  }
}

export type RawContext = {
  datasetName: string;
  extended: boolean;
  view: string;
  filters: object;
  selectedSamples: Set<string>;
  selectedLabels: any[];
  currentSample: string;
  viewName: string;
  delegationTarget: string;
  requestDelegation: boolean;
  state: CallbackInterface;
  analyticsInfo: AnalyticsInfo;
  extendedSelection: {
    selection: string[] | null;
    scope: string;
  };
  groupSlice: string;
  queryPerformance?: boolean;
  spaces: SpaceNodeJSON;
  workspaceName: string;
};

export class ExecutionContext {
  public state: CallbackInterface;
  constructor(
    public params: object = {},
    public _currentContext: RawContext,
    public hooks: object = {},
    public executor: Executor = null
  ) {
    this.state = _currentContext.state;
  }
  public delegationTarget: string = null;
  public requestDelegation = false;
  public currentPanel?: Panel = null;
  public get datasetName(): string {
    return this._currentContext.datasetName;
  }
  public get view(): string {
    return this._currentContext.view;
  }
  public get extended(): boolean {
    return this._currentContext.extended;
  }
  public get filters(): any {
    return this._currentContext.filters;
  }
  public get selectedSamples(): any {
    return this._currentContext.selectedSamples;
  }
  public get selectedLabels(): any {
    return this._currentContext.selectedLabels;
  }
  public get currentSample(): any {
    return this._currentContext.currentSample;
  }
  public get viewName(): any {
    return this._currentContext.viewName;
  }
  public get extendedSelection(): any {
    return this._currentContext.extendedSelection;
  }
  public get groupSlice(): any {
    return this._currentContext.groupSlice;
  }
  public get queryPerformance(): boolean {
    return Boolean(this._currentContext.queryPerformance);
  }
  public get spaces(): SpaceNode {
    return spaceNodeFromJSON(this._currentContext.spaces);
  }
  public get workspaceName(): string {
    return this._currentContext.workspaceName;
  }

  getCurrentPanelId(): string | null {
    return this.params.panel_id || this.currentPanel?.id || null;
  }
  trigger(operatorURI: string, params: object = {}) {
    if (!this.executor) {
      throw new Error(
        "Cannot trigger operator from outside of an execution context"
      );
    }
    this.executor.requests.push(new InvocationRequest(operatorURI, params));
  }
  log(message: string) {
    if (!this.executor) {
      throw new Error("Cannot log from outside of an execution context");
    }
    this.executor.log(message);
  }
}

function isObjWithContent(obj: any) {
  if (obj === null) return false;
  return typeof obj === "object" && Object.keys(obj).length > 0;
}

export class OperatorResult {
  constructor(
    public operator: Operator,
    public result: object = {},
    public executor: Executor = null,
    public error: string,
    public delegated: boolean = false,
    public errorMessage: string = null
  ) {}
  hasOutputContent() {
    if (this.delegated) return false;
    return isObjWithContent(this.result) || isObjWithContent(this.error);
  }
  toJSON() {
    return {
      result: this.result,
      error: this.error,
      executor: this.executor,
    };
  }
}

export type OperatorConfigOptions = {
  name: string;
  label?: string;
  description?: string;
  executeAsGenerator?: boolean;
  dynamic?: boolean;
  unlisted?: boolean;
  onStartup?: boolean;
  onDatasetOpen?: boolean;
  canExecute?: boolean;
  disableSchemaValidation?: boolean;
  icon?: string;
  darkIcon?: string;
  lightIcon?: string;
  resolveExecutionOptionsOnChange?: boolean;
  skipInput?: boolean;
  skipOutput?: boolean;
};
export class OperatorConfig {
  public name: string;
  public label: string;
  public description: string;
  public executeAsGenerator: boolean;
  public dynamic: boolean;
  public unlisted: boolean;
  public onStartup: boolean;
  public onDatasetOpen: boolean;
  public canExecute = true;
  public disableSchemaValidation = false;
  public icon = null;
  public darkIcon = null;
  public lightIcon = null;
  public resolveExecutionOptionsOnChange = false;
  public skipInput: boolean;
  public skipOutput: boolean;

  constructor(options: OperatorConfigOptions) {
    this.name = options.name;
    this.label = options.label || options.name;
    this.description = options.description;
    this.executeAsGenerator = options.executeAsGenerator || false;
    this.dynamic = options.dynamic || false;
    this.unlisted = options.unlisted || false;
    this.onStartup = options.onStartup || false;
    this.onDatasetOpen = options.onDatasetOpen || false;
    this.canExecute = options.canExecute === false ? false : true;
    this.disableSchemaValidation =
      options.disableSchemaValidation === true ? true : false;
    this.icon = options.icon;
    this.darkIcon = options.darkIcon;
    this.lightIcon = options.lightIcon;
    this.resolveExecutionOptionsOnChange =
      options.resolveExecutionOptionsOnChange || false;
    this.skipInput = options.skipInput || false;
    this.skipOutput = options.skipOutput || false;
  }
  static fromJSON(json) {
    return new OperatorConfig({
      name: json.name,
      label: json.label,
      description: json.description,
      executeAsGenerator: json.execute_as_generator,
      dynamic: json.dynamic,
      unlisted: json.unlisted,
      onStartup: Boolean(json.on_startup),
      onDatasetOpen: Boolean(json.on_dataset_open),
      canExecute: json.can_execute,
      disableSchemaValidation: json.disable_schema_validation,
      icon: json.icon,
      darkIcon: json.dark_icon,
      lightIcon: json.light_icon,
      resolveExecutionOptionsOnChange: json.resolve_execution_options_on_change,
      skipInput: json.skip_input,
      skipOutput: json.skip_output,
    });
  }
}

export class Operator {
  constructor(
    public pluginName: string,
    public _builtIn: boolean = false,
    public _config: OperatorConfig = null
  ) {
    this._config = _config;
  }

  get config(): OperatorConfig {
    return this._config;
  }
  get name(): string {
    return this.config.name;
  }
  get label(): string {
    return this.config.label;
  }
  get uri() {
    return `${this.pluginName || "@voxel51/operators"}/${this.name}`;
  }
  get unlisted() {
    return this.config.unlisted;
  }
  async needsUserInput(ctx: ExecutionContext) {
    const inputs = await this.resolveInput(ctx);
    return inputs && inputs.type && inputs.type.properties.size > 0;
  }
  needsResolution() {
    return this.config.dynamic;
  }
  needsOutputResolution() {
    return this.config.dynamic;
  }
  async needsOutput(ctx: ExecutionContext, result: OperatorResult) {
    const outputs = await this.resolveOutput(ctx, result);
    const hasOutputContent = result.hasOutputContent();
    if (!outputs || !outputs.type) return false;
    const outputType = outputs.type as types.Object;
    if (outputType.properties.size > 0 && hasOutputContent) {
      return true;
    }
    if (result.error) {
      return true;
    }
    return false;
  }
  useHooks(): object {
    // This can be overridden to use hooks in the execute function
    return {};
  }
  async resolveInput(ctx: ExecutionContext) {
    if (this.config.skipInput) return null;

    if (this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "inputs");
    }
    return null;
  }
  async resolveOutput(ctx: ExecutionContext, result: OperatorResult) {
    if (this.config.skipOutput) return null;

    if (this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "outputs", result);
    }
    return null;
  }
  async resolvePlacement(): Promise<void | types.Placement> {
    return null;
  }
  async execute(ctx: ExecutionContext) {
    ctx;
    throw new Error(`Operator ${this.uri} does not implement execute`);
  }
  public isRemote = false;
  static fromRemoteJSON(json: object) {
    const operator = this.fromJSON(json);
    operator.isRemote = true;
    return operator;
  }
  static fromJSON(json: {
    plugin_name: string;
    _builtin: boolean;
    config: object;
  }) {
    const config = OperatorConfig.fromJSON(json.config);
    const operator = new Operator(json.plugin_name, json._builtin, config);
    return operator;
  }
}

class OperatorRegistry {
  private operators: Map<string, Operator> = new Map();
  register(operator: Operator) {
    this.operators.set(operator.uri, operator);
  }
  getOperator(uri: string): Operator {
    return this.operators.get(uri);
  }
  operatorExists(uri: string) {
    return this.operators.has(uri);
  }
}

const localRegistry = new OperatorRegistry();
const remoteRegistry = new OperatorRegistry();
export let initializationErrors = [];

export function registerOperator(
  OperatorType: typeof Operator,
  pluginName: string
) {
  const operator = new OperatorType(pluginName);
  localRegistry.register(operator);
}

export function _registerBuiltInOperator(OperatorType: typeof Operator) {
  const operator = new OperatorType("@voxel51/operators", true);
  localRegistry.register(operator);
}

export async function loadOperatorsFromServer(datasetName: string) {
  initializationErrors = [];
  try {
    const { operators, errors } = await getFetchFunction()(
      "POST",
      "/operators",
      { dataset_name: datasetName }
    );
    const operatorInstances = operators.map((d: any) =>
      Operator.fromRemoteJSON(d)
    );
    for (const operator of operatorInstances) {
      remoteRegistry.register(operator);
    }
    const pyErrors = errors || [];
    if (pyErrors.length > 0) {
      console.error("Error loading python plugins:");
      for (const error of pyErrors) {
        initializationErrors.push({
          reason: "Error loading python plugins",
          details: stringifyError(error),
        });
        console.error(error);
      }
    }
  } catch (e) {
    initializationErrors.push({
      reason: "Error loading operators from server",
      details: stringifyError(e),
    });
    if (e instanceof ServerError) {
      const errorBody = e.bodyResponse;
      if (errorBody && errorBody.kind === "Server Error") {
        console.error("Error loading operators from server:");
        console.error(errorBody.stack);
      } else {
        console.error("Unknown error loading operators from server", errorBody);
      }
    } else {
      console.error(e);
      throw e;
    }
  }
}

export function getLocalOrRemoteOperator(operatorURI) {
  let operator;
  let isRemote = false;
  operatorURI = resolveOperatorURI(operatorURI);
  if (localRegistry.operatorExists(operatorURI)) {
    operator = localRegistry.getOperator(operatorURI);
  } else if (remoteRegistry.operatorExists(operatorURI)) {
    operator = remoteRegistry.getOperator(operatorURI);
    isRemote = true;
  } else {
    throw new Error(`Operator "${operatorURI}" not found`);
  }
  return { operator, isRemote };
}

export function listLocalAndRemoteOperators() {
  const localOperators = Array.from(localRegistry.operators.values());
  const remoteOperators = Array.from(remoteRegistry.operators.values());
  return {
    localOperators,
    remoteOperators,
    allOperators: [...localOperators, ...remoteOperators],
  };
}

export async function executeOperatorsForEvent(
  event: "onStartup" | "onDatasetOpen"
) {
  const { allOperators } = listLocalAndRemoteOperators();
  for (const operator of allOperators) {
    if (operator.config.canExecute && operator.config[event] === true) {
      executeOperator(operator.uri);
    }
  }
}

enum MessageType {
  SUCCESS = "success",
  ERROR = "error",
}

class ExecutionResult {
  constructor(result) {
    this.result = result;
  }
  fromJSON(json) {
    return new ExecutionResult(json.result);
  }
}
class GeneratedMessage {
  constructor(type: MessageType, cls, body) {
    this.type = type;
    this.cls = cls;
    this.body = body;
  }
  public type: MessageType;
  public cls: typeof InvocationRequest | typeof ExecutionResult;
  public body: any;
  static fromJSON(json) {
    let cls = null;
    switch (json.cls) {
      case "InvocationRequest":
        cls = InvocationRequest;
        break;
      case "ExecutionResult":
        cls = ExecutionResult;
        break;
    }
    const type =
      json.type === "SUCCESS" ? MessageType.SUCCESS : MessageType.ERROR;
    return new GeneratedMessage(type, cls, json.body);
  }
}

function formatSelectedLabels(selectedLabels) {
  const labels = [];
  if (Array.isArray(selectedLabels) && selectedLabels.length > 0) {
    return selectedLabels.map((label) => {
      const formattedLabel = {
        field: label.field,
        label_id: label.labelId,
        sample_id: label.sampleId,
      };
      if (!isNullish(label.frameNumber)) {
        formattedLabel.frame_number = label.frameNumber;
      }
      return formattedLabel;
    });
  }
  return labels;
}

async function executeOperatorAsGenerator(
  operator: Operator,
  ctx: ExecutionContext
) {
  const currentContext = ctx._currentContext;
  const parser = await getFetchFunction()(
    "POST",
    "/operators/execute/generator",
    {
      current_sample: currentContext.currentSample,
      dataset_name: currentContext.datasetName,
      delegation_target: currentContext.delegationTarget,
      extended: currentContext.extended,
      extended_selection: currentContext.extendedSelection,
      filters: currentContext.filters,
      operator_uri: operator.uri,
      params: ctx.params,
      request_delegation: ctx.requestDelegation,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
      view: currentContext.view,
      view_name: currentContext.viewName,
      group_slice: currentContext.groupSlice,
      spaces: currentContext.spaces,
      workspace_name: currentContext.workspaceName,
    },
    "json-stream"
  );

  // Add the parser to the abortable operation queue
  const abortQueue = getAbortableOperationQueue();
  abortQueue.add(operator.uri, ctx.params, parser);

  const result = { result: {} };
  const onChunk = (chunk) => {
    if (chunk?.delegated) {
      result.delegated = chunk?.delegated;
    }
    if (chunk?.error) {
      result.error = chunk?.error;
    }
    const message = GeneratedMessage.fromJSON(chunk);
    if (message.cls == InvocationRequest) {
      executeOperator(message.body.operator_uri, message.body.params);
    } else if (message.cls == ExecutionResult) {
      result.result = message.body;
    }
  };
  await parser.parse(onChunk);
  abortQueue.remove(operator.uri);
  // Should we wait for all triggered operators finish execution?
  // e.g. await Promise.all(triggerPromises)
  return result;
}

const HASH = "#";

export function resolveOperatorURI(operatorURI, { keepMethod = false } = {}) {
  if (!operatorURI) throw new Error("Operator URI is required");
  if (!keepMethod && operatorURI.includes(HASH))
    operatorURI = operatorURI.split(HASH)[0];
  if (operatorURI.includes("/")) return operatorURI;
  return `@voxel51/operators/${operatorURI}`;
}

export function getTargetOperatorMethod(operatorURI) {
  if (operatorURI && operatorURI.includes(HASH)) {
    const parts = operatorURI.split(HASH);
    return parts[1];
  }
  return null;
}

function resolveOperatorURIWithMethod(operatorURI, params) {
  const targetMethod = getTargetOperatorMethod(operatorURI);
  if (targetMethod) {
    params = { ...params, __method__: targetMethod };
  }
  return { operatorURI, params };
}

export async function executeOperator(
  uri: string,
  params: unknown = {},
  options?: OperatorExecutorOptions
) {
  const { operatorURI, params: computedParams } = resolveOperatorURIWithMethod(
    uri,
    params
  );
  const resolvedOperatorURI = resolveOperatorURI(operatorURI);
  const queue = getInvocationRequestQueue();
  const request = new InvocationRequest(
    resolvedOperatorURI,
    computedParams,
    options
  );
  queue.add(request);
}

export async function validateOperatorInputs(
  operator: Operator,
  ctx: ExecutionContext,
  resolvedInputs: types.Property
): Promise<[ValidationContext, ValidationError[]]> {
  const validationCtx = new ValidationContext(ctx, resolvedInputs, operator);
  const validationErrors = validationCtx.toProps().errors;
  return [validationCtx, validationErrors];
}

function trackOperatorExecution(
  operatorURI,
  params,
  { info, delegated, isRemote, error }
) {
  const analytics = usingAnalytics(info);
  const paramKeys = Object.keys(params || {});
  analytics.trackEvent("execute_operator", {
    uri: operatorURI,
    isRemote,
    delegated,
    params: paramKeys,
  });
  if (error) {
    analytics.trackEvent("execute_operator_error", {
      uri: operatorURI,
      isRemote,
      delegated,
      params: paramKeys,
      error,
    });
  }
}

export async function executeOperatorWithContext(
  uri: string,
  ctx: ExecutionContext
) {
  const { operatorURI, params } = resolveOperatorURIWithMethod(uri, ctx.params);
  ctx.params = params;
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorURI);
  const currentContext = ctx._currentContext;

  let result;
  let error;
  let errorMessage;
  let executor;
  let delegated = false;

  if (isRemote) {
    if (operator.config.executeAsGenerator) {
      try {
        const serverResult = await executeOperatorAsGenerator(operator, ctx);
        result = serverResult.result;
        delegated = serverResult.delegated;
        error = serverResult.error;
        errorMessage = serverResult.error_message;
      } catch (e) {
        const isAbortError =
          e.name === "AbortError" || e instanceof DOMException;
        if (!isAbortError) {
          error = e;
          console.error(`Error executing operator ${operatorURI}:`);
          console.error(error);
          errorMessage = error.message;
        }
      }
    } else {
      const serverResult = await getFetchFunction()(
        "POST",
        "/operators/execute",
        {
          current_sample: currentContext.currentSample,
          dataset_name: currentContext.datasetName,
          delegation_target: currentContext.delegationTarget,
          extended: currentContext.extended,
          extended_selection: currentContext.extendedSelection,
          filters: currentContext.filters,
          operator_uri: operatorURI,
          params: ctx.params,
          request_delegation: ctx.requestDelegation,
          selected: currentContext.selectedSamples
            ? Array.from(currentContext.selectedSamples)
            : [],
          selected_labels: formatSelectedLabels(currentContext.selectedLabels),
          view: currentContext.view,
          view_name: currentContext.viewName,
          group_slice: currentContext.groupSlice,
          query_performance: currentContext.queryPerformance,
          spaces: currentContext.spaces,
          workspace_name: currentContext.workspaceName,
        }
      );
      result = serverResult.result;
      error = serverResult.error;
      errorMessage = serverResult.error_message;
      executor = serverResult.executor;
      delegated = serverResult.delegated;
    }
  } else {
    const resolvedInputs = await operator.resolveInput(ctx);
    const [vctx, errors] = await validateOperatorInputs(
      operator,
      ctx,
      resolvedInputs
    );
    if (vctx.invalid) {
      console.error(`Invalid inputs for operator ${operatorURI}:`);
      console.error(errors);
      throw new Error(
        `Failed to execute operator ${operatorURI}. See console for details.`
      );
    }
    try {
      result = await operator.execute(ctx);
      executor = ctx.executor;
    } catch (e) {
      error = e;
      console.error(`Error executing operator ${operatorURI}:`);
      console.error(error);
      throw error;
    }
  }

  if (executor && !(executor instanceof Executor)) {
    executor = Executor.fromJSON(executor);
  }

  if (executor) executor.queueRequests();

  trackOperatorExecution(operatorURI, params, {
    info: ctx._currentContext.info,
    delegated,
    isRemote,
    error,
  });

  return new OperatorResult(
    operator,
    result,
    executor,
    error,
    delegated,
    errorMessage
  );
}

type CurrentContext = {
  datasetName: string;
  view: any;
  extended: any;
  filters: any;
  selectedSamples: Set<string>;
  selectedLabels: any;
  currentSample: string;
  viewName: string;
  extendedSelection: {
    selection: string[] | null;
    scope: string;
  };
  state: any;
  delegationTarget?: string;
};

export async function resolveRemoteType(
  operatorURI,
  ctx: ExecutionContext,
  target: "inputs" | "outputs",
  results: OperatorResult = null
) {
  operatorURI = resolveOperatorURI(operatorURI);
  const currentContext = ctx._currentContext;
  const typeAsJSON = await getFetchFunction()(
    "POST",
    "/operators/resolve-type",
    {
      current_sample: currentContext.currentSample,
      dataset_name: currentContext.datasetName,
      delegation_target: currentContext.delegationTarget,
      extended: currentContext.extended,
      extended_selection: currentContext.extendedSelection,
      filters: currentContext.filters,
      operator_uri: operatorURI,
      params: ctx.params,
      request_delegation: ctx.requestDelegation,
      results: results ? results.result : null,
      target,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
      view: currentContext.view,
      view_name: currentContext.viewName,
      group_slice: currentContext.groupSlice,
      spaces: currentContext.spaces,
      workspace_name: currentContext.workspaceName,
    }
  );

  if (typeAsJSON && typeAsJSON.error) {
    throw new Error(typeAsJSON.error);
  }
  if (typeAsJSON && (typeAsJSON.name || typeAsJSON.type)) {
    return types.Property.fromJSON(typeAsJSON);
  }
  return null;
}

const parseDateOrNull = (raw, fieldName) => {
  return raw[fieldName]?.$date ? new Date(raw[fieldName].$date) : null;
};

class Orchestrator {
  constructor(
    public id: string,
    public instanceID: string,
    public description: string = null,
    public availableOperators: string[],
    public createdAt: Date,
    public updatedAt: Date = null,
    public deactivatedAt: Date = null
  ) {}
  static fromJSON(raw: any) {
    return new Orchestrator(
      raw.id,
      raw.instance_id,
      raw.description,
      raw.available_operators,
      parseDateOrNull(raw, "created_at"),
      parseDateOrNull(raw, "updated_at"),
      parseDateOrNull(raw, "deactivated_at")
    );
  }
}
class ExecutionOptions {
  constructor(
    public orchestratorRegistrationEnabled: boolean,
    public allowImmediateExecution: boolean,
    public allowDelegatedExecution: boolean,
    public availableOrchestrators: Orchestrator[] = [],
    public defaultChoiceToDelegated: boolean = false
  ) {}
}

export async function resolveExecutionOptions(
  operatorURI,
  ctx: ExecutionContext
) {
  operatorURI = resolveOperatorURI(operatorURI);
  const currentContext = ctx._currentContext;
  const executionOptionsAsJSON = await getFetchFunction()(
    "POST",
    "/operators/resolve-execution-options",
    {
      current_sample: currentContext.currentSample,
      dataset_name: currentContext.datasetName,
      delegation_target: currentContext.delegationTarget,
      extended: currentContext.extended,
      extended_selection: currentContext.extendedSelection,
      filters: currentContext.filters,
      operator_uri: operatorURI,
      params: ctx.params,
      request_delegation: ctx.requestDelegation,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
      view: currentContext.view,
      view_name: currentContext.viewName,
      group_slice: currentContext.groupSlice,
      spaces: currentContext.spaces,
      workspace_name: currentContext.workspaceName,
    }
  );

  return new ExecutionOptions(
    executionOptionsAsJSON.orchestrator_registration_enabled,
    executionOptionsAsJSON.allow_immediate_execution,
    executionOptionsAsJSON.allow_delegated_execution,
    executionOptionsAsJSON?.available_orchestrators?.map(
      Orchestrator.fromJSON
    ) || [],
    executionOptionsAsJSON.default_choice_to_delegated
  );
}
export async function fetchRemotePlacements(ctx: ExecutionContext) {
  const currentContext = ctx._currentContext;
  const result = await getFetchFunction()(
    "POST",
    "/operators/resolve-placements",
    {
      dataset_name: currentContext.datasetName,
      extended: currentContext.extended,
      extended_selection: currentContext.extendedSelection,
      view: currentContext.view,
      filters: currentContext.filters,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
      current_sample: currentContext.currentSample,
      view_name: currentContext.viewName,
      group_slice: currentContext.groupSlice,
      spaces: currentContext.spaces,
      workspace_name: currentContext.workspaceName,
    }
  );
  if (result && result.error) {
    throw new Error(result.error);
  }

  const placementsAsJSON = result.placements;

  return placementsAsJSON.map((p) => ({
    operator: getLocalOrRemoteOperator(p.operator_uri)?.operator,
    placement: types.Placement.fromJSON(p.placement),
    isRemote: getLocalOrRemoteOperator(p.operator_uri)?.isRemote,
  }));
}

export async function resolveLocalPlacements(ctx: ExecutionContext) {
  const localOperators = Array.from(localRegistry.operators.values());
  const localPlacements = [];

  for (const operator of localOperators) {
    const placement = await operator.resolvePlacement(ctx);
    if (placement)
      localPlacements.push({ operator, placement, isRemote: false });
  }

  return localPlacements;
}

class QueueItem {
  constructor(
    public id: string,
    public request: InvocationRequest,
    public callback?: ExecutionCallback
  ) {}
  status: QueueItemStatus = QueueItemStatus.Pending;
  result: OperatorResult;
  toJSON() {
    return {
      id: this.id,
      request: this.request.toJSON(),
      status: this.status,
      result: this.result && this.result.toJSON(),
    };
  }
}

export class InvocationRequestQueue {
  constructor() {
    this._queue = [];
  }
  private _queue: QueueItem[];
  private _subscribers: InvocationRequestQueueSubscriberType[] = [];
  private _notifySubscribers() {
    for (const subscriber of this._subscribers) {
      this._notifySubscriber(subscriber);
    }
  }
  private _notifySubscriber(subscriber: InvocationRequestQueueSubscriberType) {
    subscriber(this);
  }
  subscribe(subscriber: InvocationRequestQueueSubscriberType) {
    this._subscribers.push(subscriber);
    if (this.hasPendingRequests()) {
      this._notifySubscriber(subscriber);
    }
  }
  unsubscribe(subscriber: InvocationRequestQueueSubscriberType) {
    const index = this._subscribers.indexOf(subscriber);
    if (index !== -1) {
      this._subscribers.splice(index, 1);
    }
  }
  get queue() {
    return this._queue;
  }
  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
  add(request: InvocationRequest, callback?: ExecutionCallback) {
    const item = new QueueItem(this.generateId(), request, callback);
    this._queue.push(item);
    this._notifySubscribers();
  }
  markAsExecuting(id: string) {
    const item = this._queue.find((d) => d.id === id);
    if (item) {
      item.status = QueueItemStatus.Executing;
      this._notifySubscribers();
    }
  }
  markAsCompleted(id: string) {
    const item = this._queue.find((d) => d.id === id);
    if (item) {
      item.status = QueueItemStatus.Completed;
      this._notifySubscribers();
    }
  }
  markAsFailed(id: string) {
    const item = this._queue.find((d) => d.id === id);
    if (item) {
      item.status = QueueItemStatus.Failed;
      this._notifySubscribers();
    }
  }
  hasPendingRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Pending);
  }
  hasExecutingRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Executing);
  }
  hasCompletedRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Completed);
  }
  hasFailedRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Failed);
  }
  clean() {
    this._queue = this._queue.filter(
      (d) => d.status !== QueueItemStatus.Completed
    );
    this._notifySubscribers();
  }
  getNextPendingRequest() {
    const item = this._queue.find((d) => d.status === QueueItemStatus.Pending);
    return item ? item.request : null;
  }
  toJSON() {
    return this._queue.map((d) => ({
      id: d.id,
      status: d.status,
      request: d.request.toJSON(),
      callback: d.callback,
    }));
  }
}

let invocationRequestQueue: InvocationRequestQueue;
export function getInvocationRequestQueue() {
  if (!invocationRequestQueue) {
    invocationRequestQueue = new InvocationRequestQueue();
  }
  return invocationRequestQueue;
}

class AbortableOperation {
  constructor(public id: string, public params: any, public parser: any) {}
  abort() {
    return this.parser.abort();
  }
}

class AbortableOperationQueue {
  constructor(private items = []) {}
  add(uri, params, parser) {
    this.items.push(new AbortableOperation(uri, params, parser));
  }
  remove(uri) {
    this.items = this.items.filter((d) => d.id !== uri);
  }
  findByURI(uri) {
    return this.items.filter((d) => d.id === uri);
  }
  findByExrpession(expression: (d: AbortableOperation) => boolean) {
    return this.items.filter(expression);
  }
  abortByURI(uri) {
    const items = this.findByURI(uri);
    for (const item of items) {
      item.abort();
    }
  }
  abortByExpression(expression: (d: AbortableOperation) => boolean) {
    const items = this.findByExrpession(expression);
    for (const item of items) {
      item.abort();
    }
  }
}
let abortableOperationQueue: AbortableOperationQueue;
export function getAbortableOperationQueue() {
  if (!abortableOperationQueue) {
    abortableOperationQueue = new AbortableOperationQueue();
  }
  return abortableOperationQueue;
}

/**
 * Cancels all abortable operations started by the operator with the given uri.
 *
 * @param uri The uri of the operator to abort
 */
export function abortOperationsByURI(uri) {
  getAbortableOperationQueue().abortByURI(uri);
}
/**
 * Cancels all abortable operations that match the given expression.
 * @param expression A function that takes an AbortableOperation and returns a boolean
 */
export function abortOperationsByExpression(expression) {
  getAbortableOperationQueue().abortByExpression(expression);
}

type InvocationRequestQueueSubscriberType = (
  queue: InvocationRequestQueue
) => void;
