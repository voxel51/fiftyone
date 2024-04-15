import {
  Layout,
  SpaceNode,
  usePanels,
  useSpaceNodes,
  useSpaces,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import * as types from "./types";

import copyToClipboard from "copy-to-clipboard";
import { useOperatorExecutor } from ".";
import {
  ExecutionContext,
  Operator,
  OperatorConfig,
  _registerBuiltInOperator,
  executeOperator,
  listLocalAndRemoteOperators,
} from "./operators";
import { useShowOperatorIO } from "./state";
import { useSetRecoilState } from "recoil";
import useRefetchableSavedViews from "../../core/src/hooks/useRefetchableSavedViews";
import { toSlug } from "@fiftyone/utilities";

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
  async execute({ state }: ExecutionContext) {
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
      resetExtended: fos.useResetExtendedSelection(),
    };
  }
  async execute({ state, hooks }: ExecutionContext) {
    state.reset(fos.view);
    state.reset(fos.filters);
    hooks.resetExtended();
    state.reset(fos.selectedSamples);
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
    const colorSeed = await state.snapshot.getPromise(fos.colorSeed);
    state.set(fos.colorSeed, colorSeed + 1);
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
  async execute({ state }: ExecutionContext) {
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
      resetExtended: fos.useResetExtendedSelection(),
    };
  }
  async execute({ hooks, state }: ExecutionContext) {
    const extendedSelection = await state.snapshot.getPromise(
      fos.extendedSelection
    );
    state.set(fos.selectedSamples, new Set(extendedSelection.selection));
    state.set(fos.extendedSelection, { selection: null });
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
    const { samples } = params || {};
    if (!Array.isArray(samples))
      throw new Error("param 'samples' must be an array of string");
    hooks.setSelected(new Set(samples));
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
    const refetchableSavedViews = useRefetchableSavedViews();

    return {
      refetchableSavedViews,
      setView: fos.useSetView(),
      setViewName: useSetRecoilState(fos.viewName),
    };
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.obj("view", { view: new types.HiddenView({}) });
    inputs.str("name", { label: "Name or slug of a saved view" });
    return new types.Property(inputs);
  }
  async execute({ hooks, params }: ExecutionContext) {
    const { view, name } = params || {};
    if (view) {
      hooks.setView(view);
    } else if (name) {
      const slug = toSlug(name);
      const savedViews = hooks.refetchableSavedViews?.[0]?.savedViews;
      const savedView =
        Array.isArray(savedViews) &&
        savedViews.find((view) => slug === view.slug);
      if (!savedView) {
        throw new Error(
          `Saved view with name or slug "${name}" does not exist`
        );
      }
      hooks.setViewName(slug);
    } else {
      throw new Error('Param "view" or "name" is required to set a view');
    }
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
    hooks.setView(newView);
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

class SetProgress extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_progress",
      label: "Set Progress",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.defineProperty("label", new types.String(), { label: "Label" });
    inputs.defineProperty("variant", new types.Enum(["linear", "circular"]), {
      label: "Label",
    });
    inputs.defineProperty("progress", new types.Number({ float: true }), {
      label: "Progress",
    });
    return new types.Property(inputs);
  }
  useHooks(ctx: ExecutionContext): {} {
    return {
      io: useShowOperatorIO(),
    };
  }
  async execute({ params, hooks: { io } }: ExecutionContext) {
    const loading = new types.Object();
    const progressView = new types.ProgressView({
      label: params.label,
      variant: params.variant,
    });
    loading.defineProperty("progress", new types.Number({ float: true }), {
      view: progressView,
    });
    io.show({
      schema: new types.Property(loading),
      data: { progress: params.progress },
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
    const labels = params?.labels;
    const formattedLabels = Array.isArray(labels)
      ? labels.map((label) => {
          return {
            field: label.field,
            sampleId: label.sampleId ?? label.sample_id,
            labelId: label.labelId ?? label.label_id,
            frameNumber: label.frameNumber ?? label.frame_number,
          };
        })
      : [];
    hooks.setSelected(formattedLabels);
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
    state.set(fos.selectedLabels, []);
  }
}

export function registerBuiltInOperators() {
  try {
    _registerBuiltInOperator(CopyViewAsJSON);
    _registerBuiltInOperator(ViewFromJSON);
    _registerBuiltInOperator(ReloadSamples);
    _registerBuiltInOperator(ReloadDataset);
    _registerBuiltInOperator(ClearSelectedSamples);
    _registerBuiltInOperator(OpenAllPanels);
    _registerBuiltInOperator(CloseAllPanels);
    _registerBuiltInOperator(OpenDataset);
    _registerBuiltInOperator(ClearView);
    _registerBuiltInOperator(ClearSidebarFilters);
    _registerBuiltInOperator(ClearAllStages);
    _registerBuiltInOperator(RefreshColors);
    _registerBuiltInOperator(ShowSelectedSamples);
    _registerBuiltInOperator(ConvertExtendedSelectionToSelectedSamples);
    _registerBuiltInOperator(SetSelectedSamples);
    _registerBuiltInOperator(OpenPanel);
    _registerBuiltInOperator(ClosePanel);
    _registerBuiltInOperator(SetView);
    _registerBuiltInOperator(ShowSamples);
    // _registerBuiltInOperator(ClearShowSamples);
    _registerBuiltInOperator(ConsoleLog);
    _registerBuiltInOperator(ShowOutput);
    _registerBuiltInOperator(SetProgress);
    _registerBuiltInOperator(TestOperator);
    _registerBuiltInOperator(SplitPanel);
    _registerBuiltInOperator(SetSelectedLabels);
    _registerBuiltInOperator(ClearSelectedLabels);
  } catch (e) {
    console.error("Error registering built-in operators");
    console.error(e);
  }
}

function getLayout(layout) {
  return layout === "vertical" ? Layout.Vertical : Layout.Horizontal;
}
