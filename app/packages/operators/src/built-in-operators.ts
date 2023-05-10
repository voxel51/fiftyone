import {
  SpaceNode,
  usePanels,
  useSpaceNodes,
  useSpaces,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import * as types from "./types";

import copyToClipboard from "copy-to-clipboard";
import { useOperatorExecutor } from ".";
import {
  Operator,
  OperatorConfig,
  ExecutionContext,
  registerOperator,
  loadOperatorsFromServer,
  OperatorResult,
  listLocalAndRemoteOperators,
  executeOperator,
} from "./operators";
import { useShowOperatorIO } from "./state";

//
// BUILT-IN OPERATORS
//
class ReloadSamples extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "reload_samples",
      label: "Reload samples from the dataset",
    });
  }
  async execute({ state }: ExecutionContext) {
    const refresherTick = await state.snapshot.getPromise(fos.refresher);
    state.set(fos.refresher, refresherTick + 1);
  }
}
class ReloadDataset extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "reload_dataset",
      label: "Reload the dataset",
    });
  }
  async execute({ state }: ExecutionContext) {
    // TODO - improve this... this is a temp. workaround for the fact that
    // there is no way to force reload just the dataset
    window.location.reload();
  }
}
class ClearSelectedSamples extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "clear_selected_samples",
      label: "Clear selected samples",
    });
  }
  useHooks() {
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
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "copy_view_as_json",
      label: "Copy view as JSON",
    });
  }
  async execute({ state }: ExecutionContext) {
    const view = await state.snapshot.getPromise(fos.view);
    const json = JSON.stringify(view, null, 2);
    copyToClipboard(json);
  }
}

class ViewFromJSON extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "view_from_clipboard",
      label: "Paste view from clipboard",
    });
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

class OpenPanel extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "open_panel",
      label: "Open a panel",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.defineProperty("name", new types.String(), {
      view: new types.AutocompleteView({
        choices: [
          new types.Choice("Embeddings"),
          new types.Choice("Histograms"),
          new types.Choice("Samples"),
          new types.Choice("Map"),
        ],
        label: "Name of the panel",
        required: true,
      }),
    });
    inputs.defineProperty("isActive", new types.Boolean(), {
      label: "Auto-select on open",
      required: true,
      default: true,
    });
    return new types.Property(inputs);
  }
  useHooks() {
    const { FIFTYONE_SPACE_ID } = fos.constants;
    const availablePanels = usePanels();
    const { spaces } = useSpaces(FIFTYONE_SPACE_ID);
    const openedPanels = useSpaceNodes(FIFTYONE_SPACE_ID);
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
  async execute({ hooks, params }: ExecutionContext) {
    const { spaces, openedPanels, availablePanels } = hooks;
    const { name, isActive } = params;
    const targetSpace = this.findFirstPanelContainer(spaces.root);
    if (!targetSpace) {
      return console.error("No panel container found");
    }
    const openedPanel = openedPanels.find(({ type }) => type === name);
    const panel = availablePanels.find((panel) => name === panel.name);
    const allowDuplicate = panel?.panelOptions?.allowDuplicates;
    if (openedPanel && !allowDuplicate) {
      if (isActive) spaces.setNodeActive(openedPanel);
      return;
    }
    const newNode = new SpaceNode();
    newNode.type = name;
    // add panel to the default space as an inactive panels
    spaces.addNodeAfter(targetSpace, newNode, isActive);
  }
}

class OpenAllPanels extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "open_all_panel",
      label: "Open all panels",
    });
  }
  useHooks(): object {
    const { FIFTYONE_SPACE_ID } = fos.constants;
    const availablePanels = usePanels();
    const openedPanels = useSpaceNodes(FIFTYONE_SPACE_ID);
    const openPanelOperator = useOperatorExecutor("open_panel");
    return { availablePanels, openedPanels, openPanelOperator };
  }
  async execute({ hooks }: ExecutionContext) {
    const { availablePanels, openedPanels, openPanelOperator } = hooks;
    const openedPanelsTypes = openedPanels.map(({ type }) => type);
    for (const panel of availablePanels) {
      const { name } = panel;
      if (openedPanelsTypes.includes(name)) continue;
      openPanelOperator.execute({ name, isActive: false });
    }
  }
}

// class FindSpace extends Operator {
//   findFirstPanelContainer(node: SpaceNode): SpaceNode {
//     if (node.isPanelContainer()) {
//       return node;
//     }
//     if (node.hasChildren()) {
//       return this.findFirstPanelContainer(node.firstChild());
//     }
//   }
//   useHooks(): object {
//     const { FIFTYONE_SPACE_ID } = fos.constants;
//     const { spaces } = useSpaces(FIFTYONE_SPACE_ID);
//     return { spaces };
//   }
//   async execute({ hooks }: ExecutionContext) {
//     const { spaces } = hooks;
//     return this.findFirstPanelContainer(spaces.root);
//   }
// }

class ClosePanel extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "close_panel",
      label: "Close a panel",
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.defineProperty("name", new types.String(), {
      view: new types.AutocompleteView({
        choices: [
          new types.Choice("Embeddings"),
          new types.Choice("Histograms"),
          new types.Choice("Samples"),
          new types.Choice("Map"),
        ],
        label: "Name of the panel",
        required: true,
      }),
    });
    return new types.Property(inputs);
  }
  useHooks(): object {
    const { FIFTYONE_SPACE_ID } = fos.constants;
    const { spaces } = useSpaces(FIFTYONE_SPACE_ID);
    const openedPanels = useSpaceNodes(FIFTYONE_SPACE_ID);
    return { openedPanels, spaces };
  }
  async execute({ hooks, params }: ExecutionContext) {
    const { openedPanels, spaces } = hooks;
    const { name, id } = params;
    const panel = openedPanels.find(
      (panel) => id === panel.id || name === panel.type
    );
    if (!panel)
      return console.error(
        `Opened panel with ${id ? "id" : "name"} "${
          id || name
        }" cannot be found`
      );
    if (!panel.pinned) spaces.removeNode(panel);
  }
}

class CloseAllPanels extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "close_all_panel",
      label: "Close all panels",
    });
  }
  useHooks(): object {
    const { FIFTYONE_SPACE_ID } = fos.constants;
    const openedPanels = useSpaceNodes(FIFTYONE_SPACE_ID);
    const closePanel = useOperatorExecutor("close_panel");
    return { openedPanels, closePanel };
  }
  async execute({ hooks }: ExecutionContext) {
    const { openedPanels, closePanel } = hooks;
    for (const panel of openedPanels) {
      // do not close pinned, root or space panel
      if (panel.pinned || panel.isRoot() || panel.isSpace()) continue;
      closePanel.execute(panel);
    }
  }
}

class OpenDataset extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "open_dataset",
      label: "Open Dataset",
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("dataset", { label: "Dataset name", required: true });
    return new types.Property(inputs);
  }
  useHooks(): object {
    return {
      setDataset: fos.useSetDataset(),
    };
  }
  async execute({ hooks, params }: ExecutionContext) {
    hooks.setDataset(params.dataset);
  }
}

class ClearView extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "clear_view",
      label: "Clear view bar",
    });
  }
  async execute({ state }: ExecutionContext) {
    state.reset(fos.view);
  }
}
class ClearSidebarFilters extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "clear_sidebar_filters",
      label: "Clear sidebar filters",
    });
  }
  async execute({ state }: ExecutionContext) {
    state.reset(fos.filters);
  }
}

class ClearAllStages extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "clear_all_stages",
      label: "Clear all selections, filters, and view",
    });
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
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "refresh_colors",
      label: "Refresh colors",
    });
  }
  async execute({ state }: ExecutionContext) {
    const modal = await state.snapshot.getPromise(fos.modal);
    const colorsSeed = await state.snapshot.getPromise(fos.colorSeed(!!modal));
    state.set(fos.colorSeed(!!modal), colorsSeed + 1);
  }
}

class ShowSelectedSamples extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "show_selected_samples",
      label: "Show selected samples",
    });
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
    state.set(fos.extendedSelection, {
      selection: Array.from(selectedSamples),
      scope: "global",
    });
  }
}

class ConvertExtendedSelectionToSelectedSamples extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "convert_extended_selection_to_selected_samples",
      label: "Convert extended selection to selected samples",
    });
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
    state.set(fos.selectedSamples, new Set(extendedSelection.selection));
    state.set(fos.extendedSelection, { selection: null });
    hooks.setSelected(extendedSelection.selection);
    hooks.resetExtended();
  }
}

// an operator that sets selected samples based on ctx.params
class SetSelectedSamples extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_selected_samples",
      label: "Set selected samples",
      unlisted: true,
    });
  }
  useHooks(): {} {
    return {
      setSelected: fos.useSetSelected(),
    };
  }
  async execute({ hooks, params }: ExecutionContext) {
    hooks.setSelected(params.samples);
  }
}

class SetView extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_view",
      label: "Set view",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return {
      setView: fos.useSetView(),
    };
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.obj("view", {
      label: "View",
      required: true,
    });
    return new types.Property(inputs);
  }
  async execute({ state, hooks, params }: ExecutionContext) {
    hooks.setView(params.view);
  }
}

const SHOW_SAMPLES_STAGE_ID = "show_samples_stage_id";

class ShowSamples extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "show_samples",
      label: "Show samples",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return {
      setView: fos.useSetView(),
    };
  }
  async execute({ state, hooks, params }: ExecutionContext) {
    if (params.use_extended_selection) {
      state.set(fos.extendedSelection, {
        selection: params.samples,
        scope: "global",
      });
      return;
    }
    const currentView = await state.snapshot.getPromise(fos.view);
    const newView = [
      ...currentView.filter((s) => s._uuid !== SHOW_SAMPLES_STAGE_ID),
      ...(params.samples
        ? [
            {
              _cls: "fiftyone.core.stages.Select",
              kwargs: [
                ["sample_ids", params.samples],
                ["ordered", false],
              ],
              _uuid: SHOW_SAMPLES_STAGE_ID,
            },
          ]
        : []),
    ];
    hooks.setView(fos.view, newView);
  }
}

// class ClearShowSamples extends Operator {
//   get config(): OperatorConfig {
//     return new OperatorConfig({
//       name: "clear_show_samples",
//       label: "Clear show samples",
//     });
//   }
//   async execute(ctx: ExecutionContext) {
//     executeOperator("show_samples", { samples: null });
//   }
// }

function isAtomOrSelector(v: any): boolean {
  return (
    v &&
    v.constructor &&
    v.constructor.name &&
    (v.constructor.name === "RecoilState" ||
      v.constructor.name === "RecoilValueReadOnly")
  );
}

function getTypeForValue(value: any) {
  switch (typeof value) {
    case "string":
      return new types.String();
      break;
    case "number":
      return new types.Number();
      break;
    case "boolean":
      return new types.Boolean();
      break;
    case "object":
      if (value === null) {
        return new types.String();
      }
      if (Array.isArray(value)) {
        if (value.length > 0) {
          return new types.List(getTypeForValue(value[0]));
        } else {
          return new types.List(new types.String());
        }
      }
      const type = new types.Object();
      Object.entries(value).forEach(([k, v]) => {
        type.defineProperty(k, getTypeForValue(v));
      });
      return type;
  }
}
class GetAppValue extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "get_app_value",
      label: "Get App Value",
      dynamic: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    const values = Object.entries(fos)
      .filter(([k, v]) => {
        return isAtomOrSelector(v);
      })
      .map(([k, v]) => k);
    inputs.defineProperty("target", new types.Enum(values));

    return new types.Property(inputs);
  }
  async resolveOutput(
    ctx: ExecutionContext,
    { result }: OperatorResult
  ): Promise<types.Property> {
    const outputs = new types.Object();
    outputs.defineProperty("value", new types.List(new types.String()));
    return new types.Property(outputs, { view: { name: "InferredView" } });
  }
  async execute({ params, state }: ExecutionContext) {
    const target = params.target;
    return {
      value: await state.snapshot.getPromise(fos[target]),
    };
  }
}

class ConsoleLog extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "console_log",
      label: "Console Log",
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.defineProperty("message", new types.String(), {
      label: "Message",
      required: true,
    });
    return new types.Property(inputs);
  }
  async execute({ params }: ExecutionContext) {
    console.log(params.message);
  }
}

class ShowOutput extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "show_output",
      label: "Show Output",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.defineProperty("outputs", new types.Object(), {
      label: "Outputs",
      required: true,
    });
    inputs.defineProperty("results", new types.Object(), {
      label: "Results",
      required: true,
    });
    return new types.Property(inputs);
  }
  useHooks(ctx: ExecutionContext): {} {
    return {
      io: useShowOperatorIO(),
    };
  }
  async execute({ params, hooks: { io } }: ExecutionContext) {
    io.show({
      schema: types.Property.fromJSON(params.outputs),
      data: params.results,
      isOutput: true,
    });
  }
}

class TestOperator extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "test_operator",
      label: "Test an Operator",
    });
  }
  parseParams(rawParams: string) {
    try {
      return JSON.parse(rawParams);
    } catch (e) {
      return null;
    }
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    const operatorNames = listLocalAndRemoteOperators().allOperators.map(
      (o) => o.name
    );
    inputs.defineProperty("operator", new types.Enum(operatorNames), {
      label: "Operator",
      required: true,
      view: { name: "AutocompleteView" },
    });
    const parsedParams =
      typeof ctx.params.raw_params === "string"
        ? this.parseParams(ctx.params.raw_params)
        : null;

    if (parsedParams == null) {
      inputs.defineProperty("warning", new types.String(), {
        label: "Warning",
        description: "Invalid JSON",
        view: { name: "Warning" },
      });
    }

    inputs.defineProperty("raw_params", new types.String(), {
      label: "Params",
      required: true,
      default: JSON.stringify({ param: "value" }, null, 2),
      view: { name: "CodeView", props: { language: "json" } },
    });
    return new types.Property(inputs);
  }
  async execute({ params }: ExecutionContext) {
    const parsedParams = JSON.parse(params.raw_params.trim());
    executeOperator(params.operator, parsedParams);
  }
}

export function registerBuiltInOperators() {
  try {
    registerOperator(CopyViewAsJSON);
    registerOperator(ViewFromJSON);
    registerOperator(ReloadSamples);
    registerOperator(ReloadDataset);
    registerOperator(ClearSelectedSamples);
    registerOperator(OpenAllPanels);
    registerOperator(CloseAllPanels);
    registerOperator(OpenDataset);
    registerOperator(ClearView);
    registerOperator(ClearSidebarFilters);
    registerOperator(ClearAllStages);
    registerOperator(RefreshColors);
    registerOperator(ShowSelectedSamples);
    registerOperator(ConvertExtendedSelectionToSelectedSamples);
    registerOperator(SetSelectedSamples);
    registerOperator(OpenPanel);
    registerOperator(OpenAllPanels);
    registerOperator(ClosePanel);
    registerOperator(CloseAllPanels);
    registerOperator(SetView);
    registerOperator(ShowSamples);
    // registerOperator(ClearShowSamples);
    registerOperator(GetAppValue);
    registerOperator(ConsoleLog);
    registerOperator(ShowOutput);
    registerOperator(TestOperator);
    // registerOperator(new FindSpace());
  } catch (e) {
    console.error("Error registering built-in operators");
    console.error(e);
  }
}

export async function loadOperators() {
  registerBuiltInOperators();
  await loadOperatorsFromServer();
}
