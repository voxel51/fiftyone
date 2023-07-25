import { getFetchFunction, ServerError } from "@fiftyone/utilities";
import { CallbackInterface } from "recoil";
import * as types from "./types";
import { stringifyError } from "./utils";

class InvocationRequest {
  constructor(public operatorURI: string, public params: any = {}) {}
  static fromJSON(json: any) {
    return new InvocationRequest(
      json.operator_uri || json.operator_name,
      json.params
    );
  }
  toJSON() {
    return {
      operatorURI: this.operatorURI,
      params: this.params,
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
  static fromJSON(json: any) {
    return new Executor(
      json.requests.map((r: any) => InvocationRequest.fromJSON(r)),
      json.logs
    );
  }
  trigger(operatorURI: string, params: any = {}) {
    operatorURI = resolveOperatorURI(operatorURI);
    this.requests.push(new InvocationRequest(operatorURI, params));
  }
  log(message: string) {
    this.logs.push(message);
  }
}

export class ExecutionContext {
  public state: CallbackInterface;
  constructor(
    public params: any = {},
    public _currentContext: any,
    public hooks: any = {},
    public executor: Executor = null
  ) {
    this.state = _currentContext.state;
  }
  trigger(operatorURI: string, params: any = {}) {
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
    public result: any = {},
    public executor: Executor = null,
    public error: any
  ) {}
  hasOutputContent() {
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
  canExecute?: boolean;
  disableSchemaValidation?: boolean;
  icon?: string;
  darkIcon?: string;
  lightIcon?: string;
};
export class OperatorConfig {
  public name: string;
  public label: string;
  public description: string;
  public executeAsGenerator: boolean;
  public dynamic: boolean;
  public unlisted: boolean;
  public onStartup: boolean;
  public canExecute = true;
  public disableSchemaValidation = false;
  public icon = null;
  public darkIcon = null;
  public lightIcon = null;
  constructor(options: OperatorConfigOptions) {
    this.name = options.name;
    this.label = options.label || options.name;
    this.description = options.description;
    this.executeAsGenerator = options.executeAsGenerator || false;
    this.dynamic = options.dynamic || false;
    this.unlisted = options.unlisted || false;
    this.onStartup = options.onStartup || false;
    this.canExecute = options.canExecute === false ? false : true;
    this.disableSchemaValidation =
      options.disableSchemaValidation === true ? true : false;
    this.icon = options.icon;
    this.darkIcon = options.darkIcon;
    this.lightIcon = options.lightIcon;
  }
  static fromJSON(json) {
    return new OperatorConfig({
      name: json.name,
      label: json.label,
      description: json.description,
      executeAsGenerator: json.execute_as_generator,
      dynamic: json.dynamic,
      unlisted: json.unlisted,
      onStartup: json.on_startup,
      canExecute: json.can_execute,
      disableSchemaValidation: json.disable_schema_validation,
      icon: json.icon,
      darkIcon: json.dark_icon,
      lightIcon: json.light_icon,
    });
  }
}

export class Operator {
  public definition: types.Object;
  constructor(
    public pluginName: string,
    public _builtIn: boolean = false,
    public _config: OperatorConfig = null
  ) {
    this._config = _config;
    this.definition = new types.Object();
    this.definition.defineProperty("inputs", new types.Object());
    this.definition.defineProperty("outputs", new types.Object());
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
  useHooks(ctx: ExecutionContext) {
    // This can be overridden to use hooks in the execute function
    return {};
  }
  async resolveInput(ctx: ExecutionContext) {
    if (this.config.dynamic && this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "inputs");
    } else if (this.isRemote) {
      return this.definition.getProperty("inputs");
    }
    return null;
  }
  async resolveOutput(ctx: ExecutionContext, result: OperatorResult) {
    if (this.config.dynamic && this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "outputs");
    } else if (this.isRemote) {
      return this.definition.getProperty("outputs");
    }
    return null;
  }
  async resolvePlacement(
    ctx: ExecutionContext
  ): Promise<void | types.Placement> {}
  async execute(ctx: ExecutionContext) {
    throw new Error(`Operator ${this.uri} does not implement execute`);
  }
  public isRemote: boolean = false;
  static fromRemoteJSON(json: any) {
    const operator = this.fromJSON(json);
    operator.isRemote = true;
    return operator;
  }
  static fromJSON(json: any) {
    const { inputs, outputs } = json.definition.properties;
    const config = OperatorConfig.fromJSON(json.config);
    const operator = new Operator(json.plugin_name, json._builtin, config);
    if (inputs) {
      operator.definition.addProperty(
        "inputs",
        types.Property.fromJSON(inputs)
      );
    }
    if (outputs) {
      operator.definition.addProperty(
        "outputs",
        types.Property.fromJSON(outputs)
      );
    }
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

export async function loadOperatorsFromServer() {
  initializationErrors = [];
  try {
    const { operators, errors } = await getFetchFunction()("GET", "/operators");
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

export async function executeStartupOperators() {
  const { allOperators } = listLocalAndRemoteOperators();
  const startupOperators = allOperators.filter(
    (o) => o.config.onStartup === true
  );
  for (const operator of startupOperators) {
    if (operator.config.canExecute) executeOperator(operator.uri);
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

function formatSelectedLabels(selectedLabels = {}) {
  const labels = [];
  for (const labelId of Object.keys(selectedLabels)) {
    const label = selectedLabels[labelId];
    labels.push({
      ...label,
      label_id: labelId,
      sample_id: label.sampleId,
      frame_number: label.frameNumber,
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
      operator_uri: operator.uri,
      params: ctx.params,
      dataset_name: currentContext.datasetName,
      extended: currentContext.extended,
      view: currentContext.view,
      filters: currentContext.filters,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
    },
    "json-stream"
  );

  // Add the parser to the abortable operation queue
  const abortQueue = getAbortableOperationQueue();
  abortQueue.add(operator.uri, ctx.params, parser);

  let result = null;
  let triggerPromises = [];
  const onChunk = (chunk) => {
    const message = GeneratedMessage.fromJSON(chunk);
    if (message.cls == InvocationRequest) {
      executeOperator(message.body.operator_uri, message.body.params);
    } else if (message.cls == ExecutionResult) {
      result = message.body;
    }
  };
  await parser.parse(onChunk);
  abortQueue.remove(operator.uri);
  // Should we wait for all triggered operators finish execution?
  // e.g. await Promise.all(triggerPromises)
  return result || {};
}

export function resolveOperatorURI(operatorURI) {
  if (operatorURI.includes("/")) return operatorURI;
  return `@voxel51/operators/${operatorURI}`;
}

export async function executeOperator(operatorURI, params: any = {}) {
  operatorURI = resolveOperatorURI(operatorURI);
  const queue = getInvocationRequestQueue();
  const request = new InvocationRequest(operatorURI, params);
  queue.add(request);
}

export async function executeOperatorWithContext(
  operatorURI,
  ctx: ExecutionContext
) {
  operatorURI = resolveOperatorURI(operatorURI);
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorURI);
  const currentContext = ctx._currentContext;

  let result;
  let error;
  let executor;

  if (isRemote) {
    if (operator.config.executeAsGenerator) {
      try {
        result = await executeOperatorAsGenerator(operator, ctx);
      } catch (e) {
        const isAbortError =
          e.name === "AbortError" || e instanceof DOMException;
        if (!isAbortError) {
          error = e;
          console.error(`Error executing operator ${operatorURI}:`);
          console.error(error);
        }
      }
    } else {
      const serverResult = await getFetchFunction()(
        "POST",
        "/operators/execute",
        {
          operator_uri: operatorURI,
          params: ctx.params,
          dataset_name: currentContext.datasetName,
          extended: currentContext.extended,
          view: currentContext.view,
          filters: currentContext.filters,
          selected: currentContext.selectedSamples
            ? Array.from(currentContext.selectedSamples)
            : [],
          selected_labels: formatSelectedLabels(currentContext.selectedLabels),
        }
      );
      result = serverResult.result;
      error = serverResult.error;
      executor = serverResult.executor;
    }
  } else {
    try {
      result = await operator.execute(ctx);
      executor = ctx.executor;
    } catch (e) {
      error = e;
      console.error(`Error executing operator ${operatorURI}:`);
      console.error(error);
    }
  }

  if (executor && !(executor instanceof Executor)) {
    executor = Executor.fromJSON(executor);
  }

  if (executor) executor.queueRequests();

  return new OperatorResult(operator, result, executor, error);
}

export async function resolveRemoteType(
  operatorURI,
  ctx: ExecutionContext,
  target: "inputs" | "outputs"
) {
  const currentContext = ctx._currentContext;
  const typeAsJSON = await getFetchFunction()(
    "POST",
    "/operators/resolve-type",
    {
      operator_uri: operatorURI,
      target,
      params: ctx.params,
      dataset_name: currentContext.datasetName,
      extended: currentContext.extended,
      view: currentContext.view,
      filters: currentContext.filters,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
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

export async function fetchRemotePlacements(ctx: ExecutionContext) {
  const currentContext = ctx._currentContext;
  const result = await getFetchFunction()(
    "POST",
    "/operators/resolve-placements",
    {
      dataset_name: currentContext.datasetName,
      extended: currentContext.extended,
      view: currentContext.view,
      filters: currentContext.filters,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
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

// and allows for the execution of the requests in order of arrival
// and removing the requests that have been completed

enum QueueItemStatus {
  Pending,
  Executing,
  Completed,
  Failed,
}

class QueueItem {
  constructor(public id: string, public request: InvocationRequest) {}
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
  private _subscribers: ((queue: InvocationRequestQueue) => void)[] = [];
  private _notifySubscribers() {
    for (const subscriber of this._subscribers) {
      subscriber(this);
    }
  }
  subscribe(subscriber: (queue: InvocationRequestQueue) => void) {
    this._subscribers.push(subscriber);
  }
  unsubscribe(subscriber: (queue: InvocationRequestQueue) => void) {
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
  add(request: InvocationRequest) {
    const item = new QueueItem(this.generateId(), request);
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
