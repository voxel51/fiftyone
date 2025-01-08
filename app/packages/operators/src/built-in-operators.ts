import {
  Layout,
  SpaceNode,
  usePanelTitle,
  usePanels,
  useSetPanelStateById,
  useSpaceNodes,
  useSpaces,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import * as types from "./types";

import { useTrackEvent } from "@fiftyone/analytics";
import { setPathUserUnchanged } from "@fiftyone/core/src/plugins/SchemaIO/hooks";
import * as fop from "@fiftyone/playback";
import { LOAD_WORKSPACE_OPERATOR } from "@fiftyone/spaces/src/components/Workspaces/constants";
import { toSlug } from "@fiftyone/utilities";
import copyToClipboard from "copy-to-clipboard";
import { cloneDeep, merge, set as setValue } from "lodash";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { useOperatorExecutor } from ".";
import useRefetchableSavedViews from "../../core/src/hooks/useRefetchableSavedViews";
import registerPanel from "./Panel/register";
import {
  ExecutionContext,
  Operator,
  OperatorConfig,
  OperatorResult,
  _registerBuiltInOperator,
  executeOperator,
  listLocalAndRemoteOperators,
} from "./operators";
import { useShowOperatorIO } from "./state";
import usePanelEvent from "./usePanelEvent";

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
  useHooks() {
    return { refresh: fos.useRefresh() };
  }
  async execute({ hooks }) {
    hooks.refresh();
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
  async resolveInput(): Promise<types.Property> {
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
    inputs.bool("force", {
      label: "Force (skips panel exists check)",
      default: false,
    });
    return new types.Property(inputs);
  }
  useHooks() {
    const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
    const availablePanels = usePanels();
    const { spaces } = useSpaces(FIFTYONE_GRID_SPACES_ID);
    const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
    return { availablePanels, openedPanels, spaces };
  }
  findFirstPanelContainer(node: SpaceNode): SpaceNode | null {
    if (node.isPanelContainer()) {
      return node;
    }

    if (node.hasChildren()) {
      return this.findFirstPanelContainer(node.firstChild());
    }

    return null;
  }
  async execute({ hooks, params }: ExecutionContext) {
    const { spaces, openedPanels, availablePanels } = hooks;
    const { name, isActive, layout, force, forceDuplicate } = params;
    const targetSpace = this.findFirstPanelContainer(spaces.root);
    if (!targetSpace) {
      return console.error("No panel container found");
    }
    const openedPanel = openedPanels.find(({ type }) => type === name);
    const panel = availablePanels.find((panel) => name === panel.name);
    if (!panel && !force)
      return console.warn(`Panel with name ${name} does not exist`);
    const allowDuplicate = force
      ? Boolean(forceDuplicate)
      : panel?.panelOptions?.allowDuplicates;
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
    const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
    const availablePanels = usePanels();
    const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
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
  async resolveInput(): Promise<types.Property> {
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
    const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
    const { spaces } = useSpaces(FIFTYONE_GRID_SPACES_ID);
    const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
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
    const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
    const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
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
    const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
    const { spaces } = useSpaces(FIFTYONE_GRID_SPACES_ID);
    const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
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
    });
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("dataset", { label: "Dataset name" });
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
  useHooks(): object {
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
  useHooks(): object {
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
  useHooks(): object {
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
  useHooks(): object {
    const refetchableSavedViews = useRefetchableSavedViews();

    return {
      refetchableSavedViews,
      setView: fos.useSetView(),
      setViewName: useSetRecoilState(fos.viewName),
    };
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.list("view", new types.Object(), { view: new types.HiddenView({}) });
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
  async resolveInput(): Promise<types.Property> {
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
  useHooks(): object {
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
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.defineProperty("message", new types.String(), {
      label: "Message",
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
  async resolveInput(): Promise<types.Property> {
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
  useHooks(): object {
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
  async resolveInput(): Promise<types.Property> {
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
  useHooks(): object {
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
  useHooks(): object {
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

class SetSpaces extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_spaces",
      label: "Set spaces",
      unlisted: true,
    });
  }
  useHooks() {
    const setSessionSpacesState = useSetRecoilState(fos.sessionSpaces);
    return { setSessionSpacesState };
  }
  async execute(ctx: ExecutionContext) {
    const { name, spaces } = ctx.params || {};
    if (spaces) {
      ctx.hooks.setSessionSpacesState(spaces);
    } else if (name) {
      executeOperator(LOAD_WORKSPACE_OPERATOR, { name }, { skipOutput: true });
    } else {
      throw new Error('Param "spaces" or "name" is required to set a space');
    }
  }
}

class ClearPanelState extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "clear_panel_state",
      label: "Clear panel state",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return { updatePanelState: useUpdatePanelStatePartial() };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.updatePanelState(ctx, { targetPartial: "state", clear: true });
  }
}

class ClearPanelData extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "clear_panel_data",
      label: "Clear panel data",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return { updatePanelState: useUpdatePanelStatePartial(true) };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.updatePanelState(ctx, { targetPartial: "data", clear: true });
  }
}

class SetPanelState extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_panel_state",
      label: "Set panel state",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return { updatePanelState: useUpdatePanelStatePartial() };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.updatePanelState(ctx, { targetPartial: "state", set: true });
  }
}

class SetPanelData extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_panel_data",
      label: "Set panel data",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return { updatePanelState: useUpdatePanelStatePartial(true) };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.updatePanelState(ctx, { targetPartial: "data", set: true });
  }
}

class PatchPanelData extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "patch_panel_data",
      label: "Patch panel data",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return { updatePanelState: useUpdatePanelStatePartial(true) };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.updatePanelState(ctx, { targetPartial: "data", patch: true });
  }
}

function useUpdatePanelStatePartial(local?: boolean) {
  const setPanelStateById = useSetPanelStateById(local);
  return (
    ctx,
    { targetPartial = "state", targetParam, patch, clear, deepMerge, set }
  ) => {
    targetParam = targetParam || targetPartial;
    setTimeout(() => {
      const panelId = ctx.getCurrentPanelId();
      setPanelStateById(panelId, (current = {}) => {
        const currentCustomPanelState = current?.[targetPartial] || {};
        let updatedState;
        const providedData = ctx.params[targetParam];
        if (set) {
          // set = replace entire state
          updatedState = providedData;
        } else if (deepMerge) {
          updatedState = merge({}, currentCustomPanelState, providedData);
        } else if (patch) {
          updatedState = cloneDeep(currentCustomPanelState);
          // patch = shallow merge OR set by path
          for (let [path, value] of Object.entries(providedData)) {
            setPathUserUnchanged(path, panelId); // clear user changed flag
            setValue(updatedState, path, value);
          }
        } else if (clear) {
          updatedState = {};
        } else {
          throw new Error("useUpdatePanelStatePartial: Invalid operation");
        }

        return { ...current, [targetPartial]: updatedState };
      });
    }, 1);
  };
}

class PatchPanelState extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "patch_panel_state",
      label: "Patch panel state",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return { updatePanelState: useUpdatePanelStatePartial() };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.updatePanelState(ctx, { targetPartial: "state", patch: true });
  }
}

function createFunctionFromSource(src) {
  return eval(src.trim());
}

class ReducePanelState extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "reduce_panel_state",
      label: "Reduce panel state",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    const setPanelStateById = useSetPanelStateById();
    return { setPanelStateById };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    const actualReducer = createFunctionFromSource(ctx.params.reducer);
    ctx.hooks.setPanelStateById(ctx.getCurrentPanelId(), (current) => {
      return {
        ...current,
        state: actualReducer(current.state || {}),
      };
    });
  }
}

class ShowPanelOutput extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "show_panel_output",
      label: "Show panel output",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return { updatePanelState: useUpdatePanelStatePartial(true) };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.updatePanelState(ctx, {
      targetPartial: "schema",
      targetParam: "output",
      set: true,
    });
  }
}

class RegisterPanel extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "register_panel",
      label: "Register panel",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("panel_name", { label: "Panel name", required: true });
    inputs.str("panel_label", { label: "Panel label", required: true });
    inputs.str("icon", { label: "Icon" });
    inputs.str("help_markdown", { label: "Help markdown" });
    inputs.str("category", { label: "Category" });
    inputs.bool("beta", { label: "Beta", default: false });
    inputs.bool("is_new", { label: "NEW", default: false });
    inputs.str("dark_icon", { label: "Icon for dark mode" });
    inputs.str("light_icon", { label: "Icon for light mode" });
    inputs.str("on_load", { label: "On load operator" });
    inputs.str("on_change", { label: "On change operator" });
    inputs.str("on_unload", { label: "On unload operator" });
    inputs.bool("allow_duplicates", {
      label: "Allow duplicates",
      default: false,
    });
    inputs.int("priority", { label: "Priority" });
    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    registerPanel(ctx);
  }
}

class PromptUserForOperation extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "prompt_user_for_operation",
      label: "Prompt user for operation",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("operator_uri", { label: "Operator URI", required: true });
    inputs.obj("params", { label: "Params" });
    inputs.str("on_success", { label: "On success" });
    inputs.str("on_error", { label: "On error" });
    inputs.str("on_cancel", { label: "On cancel" });
    inputs.bool("skip_prompt", { label: "Skip prompt", default: false });
    return new types.Property(inputs);
  }
  useHooks(ctx: ExecutionContext): {} {
    const triggerEvent = usePanelEvent();
    return { triggerEvent };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    const { params, operator_uri, on_success, on_error, on_cancel } =
      ctx.params;
    const { triggerEvent } = ctx.hooks;
    const panelId = ctx.getCurrentPanelId();
    const shouldPrompt = !ctx.params.skip_prompt;

    triggerEvent(panelId, {
      operator: operator_uri,
      params,
      prompt: shouldPrompt,
      onCancel: () => {
        if (on_cancel) {
          triggerEvent(panelId, {
            operator: on_cancel,
            params: { operator_uri },
          });
        }
      },
      callback: (result: OperatorResult, opts: { ctx: ExecutionContext }) => {
        const ctx = opts.ctx;
        if (result.error) {
          if (on_error) {
            triggerEvent(panelId, {
              operator: on_error,
              params: { error: result.error },
            });
          }
        } else {
          if (on_success) {
            triggerEvent(panelId, {
              operator: on_success,
              params: { result: result.result, original_params: ctx.params },
            });
          }
        }
      },
    });
  }
}

class Notify extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "notify",
      label: "Notify",
      unlisted: true,
    });
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("message", { label: "Message", required: true });
    inputs.enum("variant", ["info", "success", "warning", "error"], {
      label: "Variant",
      default: "info",
    });
    return new types.Property(inputs);
  }
  useHooks(ctx: ExecutionContext): {} {
    return { notify: fos.useNotification() };
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.notify({
      msg: ctx.params.message,
      variant: ctx.params.variant,
    });
  }
}

class SetExtendedSelection extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_extended_selection",
      label: "Set extended selection",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {} {
    return {
      setExtendedSelection: useSetRecoilState(fos.extendedSelection),
      clearExtendedSelection: useSetRecoilState(fos.extendedSelection),
      resetExtendedSelection: fos.useResetExtendedSelection(),
    };
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.list("selection", new types.String(), {
      label: "Selection",
      required: false,
    });
    inputs.str("scope", { label: "Scope", required: false });
    inputs.bool("clear", { label: "Clear", default: false });
    inputs.bool("reset", { label: "Reset", default: false });
    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    if (ctx.params.reset) {
      ctx.hooks.resetExtendedSelection();
    } else if (ctx.params.clear) {
      ctx.hooks.clearExtendedSelection();
    } else {
      ctx.hooks.setExtendedSelection({
        selection: ctx.params.selection,
        scope: ctx.params.scope,
      });
    }
  }
}

export class SetActiveFields extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_active_fields",
      label: "Set active fields",
      unlisted: true,
    });
  }
  useHooks(): {
    setActiveFields: (fields: string[]) => void;
  } {
    return {
      setActiveFields: useRecoilCallback(
        ({ snapshot, set }) =>
          async (fields) => {
            const modal = !!(await snapshot.getPromise(fos.modal));
            set(fos.activeFields({ modal }), fields);
          }
      ),
    };
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.list("fields", new types.String(), {
      label: "Fields",
      required: true,
    });
    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.setActiveFields(ctx.params.fields);
  }
}

export class TrackEvent extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "track_event",
      label: "Track event",
      unlisted: true,
    });
  }
  useHooks(ctx: ExecutionContext): {
    setActiveFields: (fields: string[]) => void;
  } {
    const trackEvent = useTrackEvent();
    return {
      trackEvent,
    };
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("event", { label: "Event", required: true });
    inputs.obj("properties", { label: "Properties" });
    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.hooks.trackEvent(ctx.params.event, ctx.params.properties);
  }
}

export class SetPanelTitle extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_panel_title",
      label: "Set panel title",
      unlisted: true,
    });
  }
  useHooks() {
    const [_, setTitle] = usePanelTitle();
    return { setTitle };
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("id", { label: "Panel ID", required: true });
    inputs.str("title", { label: "Title", required: true });
    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    const { title, id } = ctx.params;
    ctx.hooks.setTitle(title, id);
  }
}

type SetPlayheadStateHooks = {
  setPlayheadState: (state: fop.PlayheadState, timeline_name?: string) => void;
};
type SetPlayheadStateParams = {
  state: fop.PlayheadState;
  timeline_name?: string;
};

export class SetPlayheadState extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_playhead_state",
      label: "Set playhead state",
      unlisted: true,
    });
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.enum("state", ["playing", "paused"], { label: "State" });
    inputs.str("timeline_name", { label: "Timeline name" });
    return new types.Property(inputs);
  }
  useHooks(ctx: ExecutionContext): SetPlayheadStateHooks {
    const timeline = fop.useTimeline(ctx.params.timeline_name);
    return {
      setPlayheadState: (state: fop.PlayheadState) => {
        timeline.setPlayHeadState(state);
      },
    };
  }
  async execute({ hooks, params }: ExecutionContext): Promise<void> {
    const { setPlayheadState } = hooks as SetPlayheadStateHooks;
    const { state } = params as SetPlayheadStateParams;
    setPlayheadState(state);
  }
}

type SetFrameNumberParams = { timeline_name?: string; frame_number: number };
class SetFrameNumber extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_frame_number",
      label: "Set frame number",
    });
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("timeline_name", { label: "Timeline name" });
    inputs.int("frame_number", {
      label: "Frame number",
      required: true,
      min: 0,
    });
    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    const { frame_number, timeline_name } = ctx.params as SetFrameNumberParams;
    fop.dispatchTimelineSetFrameNumberEvent({
      timelineName: timeline_name,
      newFrameNumber: frame_number,
    });
  }
}

export class ApplyPanelStatePath extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "apply_panel_state_path",
      label: "Apply panel state path",
      unlisted: true,
    });
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    const { panel_id, path } = ctx.params;
    setPathUserUnchanged(path, panel_id);
  }
}

export class SetGroupSlice extends Operator {
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_group_slice",
      label: "Set group slice",
      // unlisted: true,
    });
  }
  useHooks() {
    const setSlice = fos.useSetGroupSlice();
    return { setSlice };
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("slice", { label: "Group slice", required: true });
    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext): Promise<void> {
    const { slice } = ctx.params;
    ctx.hooks.setSlice(slice);
  }
}

export class DisableQueryPerformance extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "disable_query_performance",
      label: "Disable query performance",
    });
  }

  useHooks() {
    const { disable } = fos.useQueryPerformance();
    return { disable };
  }
  async execute({ hooks }: ExecutionContext) {
    hooks.disable();
  }
}

export class EnableQueryPerformance extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "enable_query_performance",
      label: "Enable query performance",
    });
  }

  useHooks() {
    const { enable } = fos.useQueryPerformance();
    return { enable };
  }
  async execute({ hooks }: ExecutionContext) {
    hooks.enable();
  }
}

class OpenSample extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "open_sample",
      label: "Open Sample",
      unlisted: true,
    });
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("id", { label: "Sample ID" });
    inputs.str("group_id", { label: "Group ID" });

    return new types.Property(inputs);
  }
  useHooks(): object {
    return {
      setExpanded: fos.useSetExpandedSample(),
    };
  }
  async execute({ hooks, params }: ExecutionContext) {
    hooks.setExpanded({
      id: params.id,
      group_id: params.group_id,
    });
  }
}

class CloseSample extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "close_sample",
      label: "Close Sample",
      unlisted: true,
    });
  }
  useHooks(): object {
    return {
      close: fos.useClearModal(),
    };
  }
  async execute({ hooks, params }: ExecutionContext) {
    hooks.close();
  }
}

class ShowSidebar extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "show_sidebar",
      label: "Show sidebar",
    });
  }
  useHooks(): object {
    const modal = useRecoilValue(fos.modal);
    const [visible, setVisible] = useRecoilState(fos.sidebarVisible(!!modal));
    return {
      show: () => setVisible(true),
    };
  }
  async execute({ hooks }: ExecutionContext) {
    hooks.show();
  }
}

class HideSidebar extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "hide_sidebar",
      label: "Hide sidebar",
    });
  }
  useHooks(): object {
    const modal = useRecoilValue(fos.modal);
    const [visible, setVisible] = useRecoilState(fos.sidebarVisible(!!modal));
    return {
      hide: () => setVisible(false),
    };
  }
  async execute({ hooks }: ExecutionContext) {
    hooks.hide();
  }
}

class ToggleSidebar extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "toggle_sidebar",
      label: "Toggle sidebar",
    });
  }
  useHooks(): object {
    const modal = useRecoilValue(fos.modal);
    const [visible, setVisible] = useRecoilState(fos.sidebarVisible(!!modal));
    return {
      toggle: () => setVisible(!visible),
    };
  }
  async execute({ hooks }: ExecutionContext) {
    hooks.toggle();
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
    _registerBuiltInOperator(SetSpaces);
    _registerBuiltInOperator(SetPanelState);
    _registerBuiltInOperator(ClearPanelState);
    _registerBuiltInOperator(PatchPanelState);
    _registerBuiltInOperator(RegisterPanel);
    _registerBuiltInOperator(ShowPanelOutput);
    _registerBuiltInOperator(ReducePanelState);
    _registerBuiltInOperator(SetPanelData);
    _registerBuiltInOperator(ClearPanelData);
    _registerBuiltInOperator(PatchPanelData);
    _registerBuiltInOperator(PromptUserForOperation);
    _registerBuiltInOperator(Notify);
    _registerBuiltInOperator(SetExtendedSelection);
    _registerBuiltInOperator(SetActiveFields);
    _registerBuiltInOperator(TrackEvent);
    _registerBuiltInOperator(SetPanelTitle);
    _registerBuiltInOperator(ApplyPanelStatePath);
    _registerBuiltInOperator(SetGroupSlice);
    _registerBuiltInOperator(SetPlayheadState);
    _registerBuiltInOperator(SetFrameNumber);
    _registerBuiltInOperator(DisableQueryPerformance);
    _registerBuiltInOperator(EnableQueryPerformance);
    _registerBuiltInOperator(OpenSample);
    _registerBuiltInOperator(CloseSample);
    _registerBuiltInOperator(ShowSidebar);
    _registerBuiltInOperator(HideSidebar);
    _registerBuiltInOperator(ToggleSidebar);
  } catch (e) {
    console.error("Error registering built-in operators");
    console.error(e);
  }
}

function getLayout(layout) {
  return layout === "vertical" ? Layout.Vertical : Layout.Horizontal;
}
