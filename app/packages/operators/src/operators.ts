import { getFetchFunction, ServerError } from "@fiftyone/utilities";
import { CallbackInterface } from "recoil";
import * as types from "./types";

class InvocationRequest {
  constructor(public operatorURI: string, public params: any = {}) {}
  static fromJSON(json: any) {
    return new InvocationRequest(json.operator_uri, json.params);
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

export class Operator {
  public definition: types.ObjectType;
  constructor(
    public name: string,
    public label?: string,
    public description?: string,
  ) {
    this.definition = new types.ObjectType();
    this.definition.defineProperty("inputs", new types.ObjectType());
    this.definition.defineProperty("outputs", new types.ObjectType());
    this.label = label || name;
  }
  public pluginName: any;
  get uri() {
    return `${this.pluginName || "@voxel51"}/${this.name}`
  }
  get inputs(): types.Property {
    return this.definition.getProperty("inputs");
  }
  get outputs(): types.Property {
    return this.definition.getProperty("outputs");
  }
  defineInputProperty(name, type, options?) {
    const inputsType = this.inputs.type as types.ObjectType;
    return inputsType.defineProperty(name, type, options);
  }
  defineOutputProperty(name, type, options) {
    const outputsType = this.outputs.type as types.ObjectType;
    return outputsType.defineProperty(name, type, options);
  }
  needsUserInput() {
    const inputsType = this.inputs.type as types.ObjectType;
    return inputsType.properties.size > 0;
  }
  needsResolution() {
    const inputsType = this.inputs.type as types.ObjectType;
    return inputsType.needsResolution();
  }
  needsOutputResolution() {
    const outputsType = this.outputs.type as types.ObjectType;
    return outputsType.needsResolution();
  }
  needsOutput(result: OperatorResult) {
    const outputType = this.outputs.type as types.ObjectType;
    if (outputType.properties.size > 0 && result.hasOutputContent()) {
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
    const inputsType = this.inputs.type as types.ObjectType;
    if (inputsType.needsResolution()) {
      if (this.isRemote) {
        return resolveRemoteType(this.uri, ctx, "outputs");
      }

      const resolvedInputs = new types.ObjectType();
      inputsType.properties.forEach(async (property, name) => {
        if (property.hasResolver) {
          const resolved = await property.resolver(property, ctx);
          resolvedInputs.addProperty(name, resolved);
        } else {
          resolvedInputs.addProperty(name, property);
        }
      });
      return new types.Property(resolvedInputs, { view: this.inputView });
    }
    return this.inputs;
  }
  async resolveOutput(ctx: ExecutionContext, result: OperatorResult) {
    const outputsType = this.inputs.type as types.ObjectType;
    if (outputsType.needsResolution() && this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "inputs");
    }
    return this.outputs;
  }
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
    const operator = new Operator(json.name, json.label, json.description);
    console.log(operator)
    operator.pluginName = json.plugin_name;
    operator.definition.addProperty("inputs", types.Property.fromJSON(inputs));
    operator.definition.addProperty(
      "outputs",
      types.Property.fromJSON(outputs)
    );
    return operator;
  }
}

export class DynamicOperator extends Operator {
  constructor(
    public name: string,
    public description: string,
    public inputView?,
    public outputView?
  ) {
    super(name, description, inputView, outputView);
    (this.definition.getProperty("inputs").type as types.ObjectType).dynamic();
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

export function registerOperator(operator: Operator) {
  operator.pluginName = "@voxel51/operators";
  localRegistry.register(operator);
}

export async function loadOperatorsFromServer() {
  try {
    const { operators, errors } = await getFetchFunction()("GET", "/operators");
    const operatorInstances = operators.map((d: any) =>
      Operator.fromRemoteJSON(d)
    );
    for (const operator of operatorInstances) {
      remoteRegistry.register(operator);
    }
    const errorFiles = (errors && Object.keys(errors)) || [];
    if (errorFiles.length > 0) {
      for (const file of errorFiles) {
        const fileErrors = errors[file];
        console.error(`Error loading operators from ${file}:`);
        for (const error of fileErrors) {
          console.error(error);
        }
      }
    }
  } catch (e) {
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

export async function executeOperator(operatorURI, ctx: ExecutionContext) {
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorURI);
  const currentContext = ctx._currentContext;

  let result;
  let error;
  let executor;
  if (isRemote) {
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
      }
    );
    result = serverResult.result;
    error = serverResult.error;
    executor = serverResult.executor;
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
    }
  );

  if (typeAsJSON && typeAsJSON.error) {
    throw new Error(typeAsJSON.error);
  }

  return types.Property.fromJSON(typeAsJSON);
}


export async function fetchRemotePlacements(
  ctx: ExecutionContext
) {
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
    }
  );
  if (result && result.error) {
    throw new Error(result.error);
  }

  const placementsAsJSON = result.placements;

  return placementsAsJSON.map(p => ({
    operator: getLocalOrRemoteOperator(p.operator_uri),
    placement: types.Placement.fromJSON(p.placement),
  }));
}

// a queue that stores the invocation requests for all operator results
// and allows for the execution of the requests in order of arrival
// and removing the requests that have been completed
// or marking the requests as failed
// the queue should allow changes to observed via a simple subscription mechanism

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
