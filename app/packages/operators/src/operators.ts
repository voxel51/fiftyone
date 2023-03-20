import { getFetchFunction, ServerError } from "@fiftyone/utilities";
import * as types from "./types";
import { CallbackInterface, useREcoilVa } from "recoil";
import * as fos from "@fiftyone/state";
import {
  SpaceNode,
  usePanels,
  useSpaces,
  useSpaceNodes,
} from "@fiftyone/spaces";

import copyToClipboard from "copy-to-clipboard";

export class ExecutionContext {
  public state: CallbackInterface;
  constructor(
    public params: any = {},
    public _currentContext: any,
    public hooks: any = {}
  ) {
    this.state = _currentContext.state;
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
  needsResolution() {
    return this.definition.inputs.needsResolution();
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
  useHooks(ctx: ExecutionContext) {
    // This can be overridden to use hooks in the execute function
    return {};
  }
  async resolveInputRemove(ctx: ExecutionContext) {
    const { inputs } = this.definition;
    return resolveRemoteType(this.name, ctx, "inputs");
  }
  async resolveInput(ctx: ExecutionContext) {
    const { inputs } = this.definition;
    if (inputs.needsResolution()) {
      if (this.isRemote) {
        return this.resolveInputRemove(ctx);
      }
      const resolvedInputs = new types.ObjectType();
      for (const property of inputs.properties) {
        if (property.hasResolver) {
          const resolved = await property.resolver(property, ctx);
          resolvedInputs.addProperty(resolved);
        } else {
          resolvedInputs.addProperty(property);
        }
      }
      return resolvedInputs;
    }
    return inputs;
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
  } else {
    try {
      result = await operator.execute(ctx);
    } catch (e) {
      error = e;
      console.error(`Error executing operator ${operatorName}:`);
      console.error(error);
    }
  }
  return new OperatorResult(operator, result, error);
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

  return types.typeFromJSON(typeAsJSON);
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
  async execute({ hooks, state }: ExecutionContext) {
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

class OpenAllPanels extends Operator {
  constructor() {
    super("open_all_panel", "Open all panels");
  }
  useHooks(): object {
    const defaultSpaceId = "main";
    const availablePanels = usePanels();
    const { spaces } = useSpaces(defaultSpaceId);
    const openedPanels = useSpaceNodes(defaultSpaceId);
    return { availablePanels, openedPanels, spaces };
  }
  findFirstPanelContainer(node: SpaceNode): SpaceNode {
    if (node.isPanelContainer()) {
      return node;
    }

    if (node.hasChildren()) {
      return this.findFirstPanelContainer(node.firstChild());
    }
  }
  async execute({ hooks }: ExecutionContext) {
    const { availablePanels, openedPanels, spaces } = hooks;
    const openedPanelsTypes = openedPanels.map(({ type }) => type);
    const targetSpace = this.findFirstPanelContainer(spaces.root);
    if (!targetSpace) {
      return;
    }
    for (const panel of availablePanels) {
      const { name } = panel;
      if (openedPanelsTypes.includes(name)) continue;
      const newNode = new SpaceNode();
      newNode.type = name;
      // add panel to the default space as inactive panels
      spaces.addNodeAfter(targetSpace, newNode, false);
    }
  }
}

class CloseAllPanels extends Operator {
  constructor() {
    super("close_all_panel", "Close all panels");
  }
  useHooks(): object {
    const defaultSpaceId = "main";
    const { spaces } = useSpaces(defaultSpaceId);
    const openedPanels = useSpaceNodes(defaultSpaceId);
    return { openedPanels, spaces };
  }
  async execute({ hooks }: ExecutionContext) {
    const { openedPanels, spaces } = hooks;
    for (const panel of openedPanels) {
      // do not close pinned, root or space panel
      if (panel.pinned || panel.isRoot() || panel.isSpace()) continue;
      spaces.removeNode(panel);
    }
  }
}

class OpenDataset extends Operator {
  constructor() {
    super("open_dataset", "Open Dataset");
    const datasetProprety = this.definition.inputs.addProperty(
      new types.Property(
        "dataset",
        new types.Enum([]),
        "Name of the dataset",
        true
      )
    );
    datasetProprety.resolver = (property: any, ctx: ExecutionContext) => {
      console.log("datasetProprety.resolver", ctx);
      property.type = new types.Enum(ctx.hooks.availableDatasets);
      return property;
    };
  }
  useHooks(ctx: ExecutionContext): object {
    // const useSearch = getUseSearch();

    // const {values, total} = useSearch(ctx.params.dataset);
    return {
      availableDatasets: ["quickstart", "quickstart-geo", "quickstart-groups"],
      setDataset: fos.useSetDataset(),
    };
  }
  async execute({ hooks, params }: ExecutionContext) {
    hooks.setDataset(params.dataset);
  }
}

class ClearView extends Operator {
  constructor() {
    super("clear_view", "Clear view bar");
  }
  async execute({ state }: ExecutionContext) {
    state.reset(fos.view);
  }
}
class ClearSidebarFilters extends Operator {
  constructor() {
    super("clear_sidebar_filters", "Clear sidebar filters");
  }
  async execute({ state }: ExecutionContext) {
    state.reset(fos.filters);
  }
}

class ClearAllStages extends Operator {
  constructor() {
    super("clear_all_stages", "Clear all selections, filters, and view");
  }
  useHooks(): {} {
    return {
      setSelected: fos.useSetSelected(),
      resetExtended: fos.useResetExtendedSelection(),
    };
  }
  async execute({ state, hooks }: ExecutionContext) {
    state.reset(fos.view);
    state.reset(fos.filters);
    hooks.resetExtended();
    state.reset(fos.selectedSamples);
    hooks.setSelected([]);
  }
}

class RefreshColors extends Operator {
  constructor() {
    super("refresh_colors", "Refresh colors");
  }
  async execute({ state }: ExecutionContext) {
    const modal = await state.snapshot.getPromise(fos.modal);
    console.log("modal", modal);
    const colorsSeed = await state.snapshot.getPromise(fos.colorSeed(!!modal));
    state.set(fos.colorSeed(!!modal), colorsSeed + 1);
  }
}

class ShowSelectedSamples extends Operator {
  constructor() {
    super("show_selected_samples", "Show selected samples");
  }
  useHooks(): {} {
    return {
      setSelected: fos.useSetSelected(),
    };
  }
  async execute({ hooks, state }: ExecutionContext) {
    const selectedSamples = await state.snapshot.getPromise(
      fos.selectedSamples
    );
    console.log("selectedSamples", selectedSamples);
    state.set(fos.extendedSelection, {
      selection: Array.from(selectedSamples),
      scope: "global",
    });
  }
}

class ConvertExtendedSelectionToSelectedSamples extends Operator {
  constructor() {
    super(
      "convert_extended_selection_to_selected_samples",
      "Convert extended selection to selected samples"
    );
  }
  useHooks(): {} {
    return {
      setSelected: fos.useSetSelected(),
      resetExtended: fos.useResetExtendedSelection(),
    };
  }
  async execute({ hooks, state }: ExecutionContext) {
    const extendedSelection = await state.snapshot.getPromise(
      fos.extendedSelection
    );
    console.log("extendedSelection", extendedSelection);
    state.set(fos.selectedSamples, new Set(extendedSelection.selection));
    state.set(fos.extendedSelection, { selection: null });
    hooks.setSelected(extendedSelection.selection);
    hooks.resetExtended();
  }
}

class DynamicFormExample extends Operator {
  constructor() {
    super("dynamic_form_example", "Dynamic Form Example");
    this.definition.inputs.addProperty(
      new types.Property(
        "mode",
        new types.Enum(["simple", "advanced"]),
        "Mode",
        true,
        "simple"
      )
    );
  }
  useHooks(ctx: ExecutionContext): {} {
    const [sampleId] = useRecoilValue(fos.selectedSamples) || [];
    return {
      sampleId,
    };
  }
  async resolveInput(ctx: ExecutionContext) {
    const inputs = new types.ObjectType();
    inputs.addProperty(
      new types.Property(
        "mode",
        new types.Enum(["simple", "advanced"]),
        "Mode",
        true,
        "simple"
      )
    );
    inputs.addProperty(
      new types.Property("name", new types.String(), "Name", true)
    );
    if (ctx.params.mode === "advanced") {
      inputs.addProperty(
        new types.Property(
          "sampleId",
          new types.String(),
          "Sample ID",
          true,
          ctx.hooks.sampleId
        )
      );
      inputs.addProperty(
        new types.Property("threshold", new types.Number(), "Threshold", true)
      );
      if (ctx.params.threshold > 5) {
        inputs.addProperty(
          new types.Property("clamp", new types.Boolean(), "Clamping", true)
        );
      }
    }
    return inputs;
  }
}

export function registerBuiltInOperators() {
  registerOperator(new CopyViewAsJSON());
  registerOperator(new ViewFromJSON());
  registerOperator(new ReloadSamples());
  registerOperator(new ClearSelectedSamples());
  registerOperator(new OpenAllPanels());
  registerOperator(new CloseAllPanels());
  registerOperator(new OpenDataset());
  registerOperator(new ClearView());
  registerOperator(new ClearSidebarFilters());
  registerOperator(new ClearAllStages());
  registerOperator(new RefreshColors());
  registerOperator(new ShowSelectedSamples());
  registerOperator(new ConvertExtendedSelectionToSelectedSamples());
  registerOperator(new DynamicFormExample());
}

export async function loadOperators() {
  registerBuiltInOperators();
  await loadOperatorsFromServer();
}
