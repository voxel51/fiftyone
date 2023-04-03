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
  ExecutionContext,
  registerOperator,
  loadOperatorsFromServer,
} from "./operators";

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

class OpenPanel extends Operator {
  constructor() {
    super("open_panel", "Open a panel");
    // todo: dynamically generate the list
    this.defineInputProperty(
      "name",
      new types.Enum(["Histograms", "Embeddings"]),
      { label: "Name of the panel", required: true }
    );
    this.defineInputProperty("isActive", new types.Boolean(), {
      label: "Auto-select on open",
      required: true,
    });
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
    const { spaces } = hooks;
    const { name, isActive } = params;
    const targetSpace = this.findFirstPanelContainer(spaces.root);
    if (!targetSpace) {
      return console.error("No panel container found");
    }
    const newNode = new SpaceNode();
    newNode.type = name;
    // add panel to the default space as an inactive panels
    spaces.addNodeAfter(targetSpace, newNode, isActive);
  }
}

class OpenAllPanels extends Operator {
  constructor() {
    super("open_all_panel", "Open all panels");
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
//   constructor() {
//     super("find_space", "Find space");
//   }
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
  constructor() {
    super("close_panel", "Close a panel");
    // todo: dynamically generate the list
    this.defineInputProperty(
      "name",
      new types.Enum(["Histograms", "Embeddings"]),
      { label: "Name of the panel", required: true }
    );
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
    const targetPanel = openedPanels.find(
      (panel) => id === panel.id || name === panel.type
    );
    if (!targetPanel)
      return console.error(
        `Opened panel with ${id ? "id" : "name"} "${
          id || name
        }" cannot be found`
      );
    spaces.removeNode(targetPanel);
  }
}

class CloseAllPanels extends Operator {
  constructor() {
    super("close_all_panel", "Close all panels");
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
  constructor() {
    const openDatasetInputView = new types.View({ label: "Winter" });
    super("open_dataset", "Open Dataset", openDatasetInputView);
    const datasetProperty = this.defineInputProperty(
      "dataset",
      new types.Enum([]),
      {
        label: "Name of the dataset",
        required: true,
      }
    );
    datasetProperty.resolver = (property: any, ctx: ExecutionContext) => {
      property.type = new types.Enum(ctx.hooks.availableDatasets);
      return property;
    };
  }
  useHooks(): object {
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
    state.set(fos.selectedSamples, new Set(extendedSelection.selection));
    state.set(fos.extendedSelection, { selection: null });
    hooks.setSelected(extendedSelection.selection);
    hooks.resetExtended();
  }
}

// an operator that sets selected samples based on ctx.params
class SetSelectedSamples extends Operator {
  constructor() {
    super("set_selected_samples", "Set selected samples");
    this.defineInputProperty("samples", new types.List(new types.SampleID()), {
      label: "Samples",
      required: true,
    });
    // this.inputs.addProperty(
    //   "samples",
    //   new types.Property(new types.List(new types.SampleID()), "Samples", true)
    // );
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

class DynamicFormExample extends Operator {
  constructor() {
    super("dynamic_form_example", "Dynamic Form Example");
    this.defineInputProperty("mode", new types.Enum(["simple", "advanced"]), {
      label: "Mode",
      required: true,
      defaultValue: "simple",
    });
  }
  useHooks(): { sampleId: string } {
    const [sampleId] = useRecoilValue(fos.selectedSamples) || [];
    return { sampleId };
  }
  async resolveInput(ctx: ExecutionContext) {
    const inputs = new types.Property(new types.ObjectType());
    const inputsType = inputs.type as types.ObjectType;
    inputsType.defineProperty("mode", new types.Enum(["simple", "advanced"]), {
      label: "Mode",
      required: true,
    });
    inputsType.defineProperty("name", new types.String(), { label: "Name" });
    if (ctx.params.mode === "advanced") {
      inputsType.defineProperty("sampleId", new types.String(), {
        label: "Sample ID",
        required: true,
        defaultValue: ctx.hooks.sampleId,
      });
      inputsType.defineProperty("threshold", new types.Number(), {
        label: "Threshold",
        required: true,
      });
      if (ctx.params.threshold > 5) {
        inputsType.defineProperty("clamp", new types.Boolean(), {
          label: "Clamping",
          required: true,
        });
      }
    }
    return inputs;
  }
}

export function registerBuiltInOperators() {
  try {
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
    registerOperator(new SetSelectedSamples());
    registerOperator(new DynamicFormExample());
    registerOperator(new OpenPanel());
    registerOperator(new OpenAllPanels());
    registerOperator(new ClosePanel());
    registerOperator(new CloseAllPanels());
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
