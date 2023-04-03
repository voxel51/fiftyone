import { getFetchFunction, ServerError } from "@fiftyone/utilities";
import { CallbackInterface } from "recoil";
import * as types from "./types";

export class ExecutionContext {
  public state: CallbackInterface;
  constructor(
    public params: any = {},
    public _currentContext: any,
    public hooks: any = {}
  ) {
    this.state = _currentContext.state;
  }
  private _triggers: Array<Trigger> = [];
  trigger(operatorName: string, params: any = {}) {
    this._triggers.push(new Trigger(operatorName, params));
  }
}

class Trigger {
  constructor(public operatorName: string, public params: any = {}) {}
  static fromJSON(json: any) {
    return new Trigger(json.operatorName, json.params);
  }
}

function isObjWithContent(obj: any) {
  if (obj === null) return false;
  return typeof obj === "object" && Object.keys(obj).length > 0;
}

class OperatorResult {
  constructor(
    public operator: Operator,
    public result: any = {},
    public error: any,
    public triggers: Trigger[] = []
  ) {}
  hasOutputContent() {
    return isObjWithContent(this.result) || isObjWithContent(this.error);
  }
  toJSON() {
    return {
      result: this.result,
      error: this.error,
    };
  }
}

export class Operator {
  public definition: types.ObjectType;
  constructor(
    public name: string,
    public description: string,
    public inputView?,
    public outputView?
  ) {
    this.definition = new types.ObjectType();
    this.definition.defineProperty("inputs", new types.ObjectType(), {
      view: inputView,
    });
    this.definition.defineProperty("outputs", new types.ObjectType(), {
      view: inputView,
    });
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
  async resolveInputRemote(ctx: ExecutionContext) {
    return resolveRemoteType(this.name, ctx, "inputs");
  }
  async resolveInput(ctx: ExecutionContext) {
    const inputsType = this.inputs.type as types.ObjectType;
    if (inputsType.needsResolution()) {
      if (this.isRemote) {
        return this.resolveInputRemote(ctx);
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
  async execute(ctx: ExecutionContext) {
    throw new Error(`Operator ${this.name} does not implement execute`);
  }
  public isRemote: boolean = false;
  static fromRemoteJSON(json: any) {
    const operator = this.fromJSON(json);
    operator.isRemote = true;
    return operator;
  }
  static fromJSON(json: any) {
    const { inputs, outputs } = json.definition.properties;
    const operator = new Operator(json.name, json.description);
    operator.definition.addProperty("inputs", types.Property.fromJSON(inputs));
    operator.definition.addProperty(
      "outputs",
      types.Property.fromJSON(outputs)
    );
    return operator;
  }
}

class OperatorRegistry {
  private operators: Map<string, Operator> = new Map();
  register(operator: Operator) {
    this.operators.set(operator.name, operator);
  }
  getOperator(name: string): Operator {
    return this.operators.get(name);
  }
  operatorExists(name: string) {
    return this.operators.has(name);
  }
}

const localRegistry = new OperatorRegistry();
const remoteRegistry = new OperatorRegistry();

export function registerOperator(operator: Operator) {
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

export function getLocalOrRemoteOperator(operatorName) {
  let operator;
  let isRemote = false;
  if (localRegistry.operatorExists(operatorName)) {
    operator = localRegistry.getOperator(operatorName);
  } else if (remoteRegistry.operatorExists(operatorName)) {
    operator = remoteRegistry.getOperator(operatorName);
    isRemote = true;
  } else {
    throw new Error(`Operator "${operatorName}" not found`);
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

export async function executeOperator(operatorName, ctx: ExecutionContext) {
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorName);
  const currentContext = ctx._currentContext;

  let result;
  let error;
  let triggers;
  if (isRemote) {
    const serverResult = await getFetchFunction()(
      "POST",
      "/operators/execute",
      {
        operator_name: operatorName,
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
    triggers = serverResult.triggers;
  } else {
    try {
      result = await operator.execute(ctx);
      triggers = ctx.triggers;
    } catch (e) {
      error = e;
      console.error(`Error executing operator ${operatorName}:`);
      console.error(error);
    }
  }

  return new OperatorResult(operator, result, error, triggers);
}

export async function resolveRemoteType(
  operatorName,
  ctx: ExecutionContext,
  target: "inputs" | "outputs"
) {
  const currentContext = ctx._currentContext;
  const typeAsJSON = await getFetchFunction()(
    "POST",
    "/operators/resolve-type",
    {
      operator_name: operatorName,
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
