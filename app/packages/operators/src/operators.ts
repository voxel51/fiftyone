import { getFetchFunction, ServerError } from "@fiftyone/utilities";
import * as types from "./types";
import { CallbackInterface } from "recoil";
import * as fos from "@fiftyone/state";
import { useState } from "react";

import copyToClipboard from "copy-to-clipboard";

export class ExecutionContext {
  public state: CallbackInterface;
  constructor(
    public params: Map<string, any> = new Map(),
    _currentContext: any,
    public hooks: { [key: string]: any } = {}
  ) {
    this.state = _currentContext.state;
  }
}

function isObjWithContent(obj: any) {
  return typeof obj === "object" && Object.keys(obj).length > 0;
}

class OperatorResult {
  constructor(
    public operator: Operator,
    public result: any = {},
    public error: any
  ) {}
  hasOutputContent() {
    return isObjWithContent(this.result) || isObjWithContent(this.error);
  }
  getTriggers() {
    if (isObjWithContent(this.result)) {
      const triggerProps = this.operator.definition.outputs.filter(
        (p) => p.type === types.Trigger
      );
    }
  }
  toJSON() {
    return {
      result: this.result,
      error: this.error,
    };
  }
}

class OperatorDefinition {
  constructor(public description: string) {
    this.inputs = new types.ObjectType();
    this.outputs = new types.ObjectType();
  }
  public inputs: types.ObjectType;
  public outputs: types.ObjectType;
  addInputProperty(property: types.Property) {
    this.inputs.addProperty(property);
  }
  addOutputProperty(property: types.Property) {
    this.outputs.addProperty(property);
  }
  static fromJSON(json: any) {
    const def = new OperatorDefinition(json.description);
    def.inputs = types.ObjectType.fromJSON(json.inputs);
    def.outputs = types.ObjectType.fromJSON(json.outputs);
    return def;
  }
}

export class Operator {
  public definition: OperatorDefinition;
  constructor(public name: string, description: string) {
    this.name = name;
    this.definition = new OperatorDefinition(description);
  }
  needsUserInput() {
    return this.definition.inputs.properties.length > 0;
  }
  needsOutput(result: OperatorResult) {
    if (
      this.definition.outputs.properties.length > 0 &&
      result.hasOutputContent()
    ) {
      return true;
    }
    if (result.error) {
      return true;
    }
    return false;
  }
  useHooks() {
    // This can be overriden to use hooks in the execute function
    return {};
  }
  async execute(ctx: ExecutionContext) {
    throw new Error(`Operator ${this.name} does not implement execute`);
  }
  static fromJSON(json: any) {
    const operator = new Operator(json.name, json.description);
    operator.definition = OperatorDefinition.fromJSON(json.definition);
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
    const operatorInstances = operators.map((d: any) => Operator.fromJSON(d));
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

export function useLocalOperators() {}

export function useRemoteOperators() {}

export function useOperators() {}

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

export async function executeOperator(
  operatorName,
  params,
  currentContext,
  hooks
) {
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorName);

  const ctx = new ExecutionContext(params, currentContext, hooks);
  let result;
  let error;
  if (isRemote) {
    const serverResult = await getFetchFunction()(
      "POST",
      "/operators/execute",
      {
        operator_name: operatorName,
        params: params,
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
  } else {
    try {
      result = await operator.execute(ctx);
    } catch (e) {
      error = e;
    }
  }
  return new OperatorResult(operator, result, error);
}

//
// BUILT-IN OPERATORS
//
class ReloadSamples extends Operator {
  constructor() {
    super("reload_samples", "Reload samples from the dataset");
  }
  async execute({ state }: ExecutionContext) {
    const refresherTick = await state.snapshot.getPromise(fos.refresher);
    state.set(fos.refresher, refresherTick + 1);
  }
}

class ClearSelectedSamples extends Operator {
  constructor() {
    super("clear_selected_samples", "Clear selected samples");
  }
  useHooks(): {} {
    return {
      setSelected: fos.useSetSelected(),
    };
  }
  async execute({ state, hooks }: ExecutionContext) {
    // needs to mutate the server / session
    hooks.setSelected([]);
    state.reset(fos.selectedSamples);
  }
}

class CopyViewAsJSON extends Operator {
  constructor() {
    super("copy_view_as_json", "Copy view as JSON");
  }
  async execute({ state }: ExecutionContext) {
    const view = await state.snapshot.getPromise(fos.view);
    const json = JSON.stringify(view, null, 2);
    copyToClipboard(json);
  }
}

class ViewFromJSON extends Operator {
  constructor() {
    super("view_from_json", "Create view from clipboard");
  }
  async execute({ state }: ExecutionContext) {
    const text = await navigator.clipboard.readText();
    try {
      const view = JSON.parse(text);
      state.set(fos.view, view);
    } catch (e) {
      console.error("Error parsing JSON", e);
    }
  }
}

export function registerBuiltInOperators() {
  registerOperator(new CopyViewAsJSON());
  registerOperator(new ViewFromJSON());
  registerOperator(new ReloadSamples());
  registerOperator(new ClearSelectedSamples());
}

export async function loadOperators() {
  registerBuiltInOperators();
  await loadOperatorsFromServer();
}
