import {
  SpaceNode,
  usePanels,
  useSpaceNodes,
  useSpaces,
  Layout,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import * as types from "./types";

import copyToClipboard from "copy-to-clipboard";
import { useOperatorExecutor } from ".";
import {
  ExecutionContext,
  Operator,
  OperatorConfig,
  executeOperator,
  listLocalAndRemoteOperators,
  loadOperatorsFromServer,
  registerOperator,
} from "./operators";
import { useShowOperatorIO } from "./state";

//
// BUILT-IN OPERATORS
//
class ReloadSamples extends Operator {
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "open_panel",
      label: "Open a panel",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("name", {
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
    inputs.bool("isActive", {
      label: "Auto-select on open",
      required: true,
      default: true,
    });
    inputs.enum("layout", ["horizontal", "vertical"]);
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
    const { name, isActive, layout } = params;
    const targetSpace = this.findFirstPanelContainer(spaces.root);
    if (!targetSpace) {
      return console.error("No panel container found");
    }
    const openedPanel = openedPanels.find(({ type }) => type === name);
    const panel = availablePanels.find((panel) => name === panel.name);
    if (!panel) return console.warn(`Panel with name ${name} does not exist`);
    const allowDuplicate = panel?.panelOptions?.allowDuplicates;
    if (openedPanel && !allowDuplicate) {
      if (isActive) spaces.setNodeActive(openedPanel);
      return;
    }
    const newNode = new SpaceNode();
    newNode.type = name;
    // add panel to the default space as an inactive panels
    spaces.addNodeAfter(targetSpace, newNode, isActive);
    if (layout) {
      spaces.splitLayout(targetSpace, getLayout(layout), newNode);
    }
  }
}

class OpenAllPanels extends Operator {
  _builtIn = true;
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

class ClosePanel extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "close_panel",
      label: "Close a panel",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("name", {
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
  _builtIn = true;
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

class SplitPanel extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "split_panel",
      label: "Split Panel",
      unlisted: true,
    });
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("name", { required: true });
    inputs.enum("layout", ["horizontal", "vertical"], { required: true });
    return new types.Property(inputs);
  }
  useHooks(): object {
    const { FIFTYONE_SPACE_ID } = fos.constants;
    const { spaces } = useSpaces(FIFTYONE_SPACE_ID);
    const openedPanels = useSpaceNodes(FIFTYONE_SPACE_ID);
    return { spaces, openedPanels };
  }
  async execute({ hooks, params }: ExecutionContext) {
    const { openedPanels, spaces } = hooks;
    const { name, layout } = params;
    const panel = openedPanels.find(({ type }) => type === name);
    const parentNode = panel?.parent;
    if (parentNode && spaces.canSplitLayout(parentNode) && panel) {
      spaces.splitLayout(parentNode, getLayout(layout), panel);
    }
  }
}

class OpenDataset extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "open_dataset",
      label: "Open Dataset",
      unlisted: true,
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
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "refresh_colors",
      label: "Refresh colors",
    });
  }
  async execute({ state }: ExecutionContext) {
    const colorsSeed = await state.snapshot.getPromise(fos.colorSeed);
    state.set(fos.colorSeed, colorsSeed + 1);
  }
}

class ShowSelectedSamples extends Operator {
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
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
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "show_samples",
      label: "Show samples",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.list("samples", new types.String(), {
      label: "Samples",
      required: true,
    });
    inputs.bool("use_extended_selection", {
      label: "Use extended selection",
      default: false,
    });
    return new types.Property(inputs);
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

class ConsoleLog extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "console_log",
      label: "Console Log",
      unlisted: true,
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
  _builtIn = true;
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
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "test_operator",
      label: "Test an Operator",
      dynamic: true,
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
    const choices = new types.AutocompleteView();
    const { allOperators } = listLocalAndRemoteOperators();
    for (const operator of allOperators) {
      choices.addChoice(operator.uri, {
        label: operator.label,
        description: operator.uri,
      });
    }
    inputs.defineProperty("operator", new types.Enum(choices.values()), {
      label: "Operator",
      required: true,
      view: choices,
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

class SetSelectedLabels extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_selected_labels",
      label: "Set selected labels",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return {
      setSelected: fos.useSetSelectedLabels(),
    };
  }
  async execute({ hooks, params }: ExecutionContext) {
    hooks.setSelected(params.labels);
  }
}

class ClearSelectedLabels extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "clear_selected_labels",
      label: "Clear selected labels",
    });
  }
  async execute({ state }: ExecutionContext) {
    state.set(fos.selectedLabels, {});
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
    registerOperator(ConsoleLog);
    registerOperator(ShowOutput);
    registerOperator(TestOperator);
    registerOperator(SplitPanel);
    registerOperator(SetSelectedLabels);
    registerOperator(ClearSelectedLabels);
  } catch (e) {
    console.error("Error registering built-in operators");
    console.error(e);
  }
}

export async function loadOperators() {
  registerBuiltInOperators();
  await loadOperatorsFromServer();
}

function getLayout(layout) {
  return layout === "vertical" ? Layout.Vertical : Layout.Horizontal;
}
