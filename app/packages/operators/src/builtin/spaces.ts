import { usePanels, usePanelsState, useSpaceNodes } from "@fiftyone/spaces";
import {
  constants,
  isModalActive,
  sampleViewPanelsControllerAtom,
  type SampleViewPanelsController,
} from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useRecoilValue } from "recoil";
import { Operator, OperatorConfig } from "../operators";
import * as types from "../types";

import type {
  ExecutionContext,
  GetPanelDataHooks,
  GetPanelDataParams,
  GetPanelStateHooks,
  GetPanelStateParams,
  ListOpenPanelsHooks,
  ListOpenPanelsItemType,
  ListPanelItemType,
  ListPanelsHooks,
  ListPanelsParams,
  OpenedPanelRef,
} from "../ts";

const { FIFTYONE_GRID_SPACES_ID } = constants;

/** Open panels on both surfaces, as `{ id, type }` refs. */
function openedPanelRefs(
  gridNodes: { id: string; type?: unknown; isPanel: () => boolean }[],
  sampleViewPanels: SampleViewPanelsController | null,
): OpenedPanelRef[] {
  return [
    ...gridNodes
      .filter((node) => node.isPanel())
      .map((node) => ({ id: node.id, type: String(node.type) })),
    ...(sampleViewPanels?.list() ?? []).map((tile) => ({
      id: tile.id,
      type: tile.name,
    })),
  ];
}

export class ListPanels extends Operator {
  _builtIn = true;

  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "list_panels",
      label: "List panels",
      unlisted: true,
    });
  }

  async resolveInput() {
    const inputs = new types.Object();

    inputs.enum("surface", ["grid", "modal"], { label: "Surface" });

    return new types.Property(inputs);
  }

  useHooks(): ListPanelsHooks {
    const panels = usePanels();

    return { panels };
  }

  async execute(
    ctx: ExecutionContext<ListPanelsParams, ListPanelsHooks>,
  ): Promise<ListPanelItemType[]> {
    const { hooks, params } = ctx;
    const { panels } = hooks;
    const { surface } = params;

    if (surface === "modal") {
      return panels.filter((panel) =>
        panel.panelOptions?.surfaces?.includes("modal"),
      );
    } else if (surface === "grid") {
      return panels.filter((panel) => {
        const surfaces = panel.panelOptions?.surfaces;
        return !surfaces || surfaces.includes("grid");
      });
    }

    return panels.map((panel) => ({
      name: panel.name,
      label: panel.label,
      panelOptions: panel.panelOptions,
    }));
  }
}

export class ListOpenPanels extends Operator {
  _builtIn = true;

  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "list_open_panels",
      label: "List open panels",
      unlisted: true,
    });
  }

  useHooks(): ListOpenPanelsHooks {
    const isModalOpen = useRecoilValue(isModalActive);
    const openedGridPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
    const sampleViewPanels = useAtomValue(sampleViewPanelsControllerAtom);
    const panels = usePanels();

    return { isModalOpen, openedGridPanels, sampleViewPanels, panels };
  }

  async execute(
    ctx: ExecutionContext<void, ListOpenPanelsHooks>,
  ): Promise<ListOpenPanelsItemType[]> {
    const { hooks } = ctx;
    const { isModalOpen, openedGridPanels, sampleViewPanels, panels } = hooks;

    const panelsByName = panels.reduce((panelsMap, panel) => {
      panelsMap[panel.name] = panel;
      return panelsMap;
    }, {});

    if (isModalOpen) {
      // Sample-view tiles have no pinned state; every tile can be closed.
      return (sampleViewPanels?.list() ?? []).map((tile) => {
        const panelInfo = panelsByName[tile.name];
        return {
          name: tile.name,
          label: panelInfo?.label,
          panelOptions: panelInfo?.panelOptions,
          id: tile.id,
          pinned: false,
        };
      });
    }

    return openedGridPanels
      .filter((panel) => panel.isPanel())
      .map((panel) => {
        const panelName = panel.type.toString();
        const panelInfo = panelsByName[panelName];
        return {
          name: panelName,
          label: panelInfo?.label,
          panelOptions: panelInfo?.panelOptions,
          id: panel.id,
          pinned: Boolean(panel.pinned),
        };
      });
  }
}

export class GetPanelState extends Operator {
  _builtIn = true;

  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "get_panel_state",
      label: "Get panel state",
      unlisted: true,
    });
  }

  async resolveInput() {
    const inputs = new types.Object();

    inputs.str("id", { label: "Panel ID" });
    inputs.str("name", { label: "Panel Name" });

    return new types.Property(inputs);
  }

  useHooks(): GetPanelStateHooks {
    const openedGridPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
    const sampleViewPanels = useAtomValue(sampleViewPanelsControllerAtom);
    const [panelsState] = usePanelsState();

    const openedPanels = openedPanelRefs(openedGridPanels, sampleViewPanels);

    return { openedPanels, panelsState };
  }

  async execute(
    ctx: ExecutionContext<GetPanelStateParams, GetPanelStateHooks>,
  ) {
    const { hooks, params } = ctx;
    const { openedPanels, panelsState } = hooks;
    const { id, name } = params;

    let computedId = id;

    if (!computedId) {
      computedId = openedPanels.find((panel) => panel.type === name)?.id;
    }

    if (!computedId) {
      throw new Error("Panel not found");
    }

    return panelsState[computedId];
  }
}

export class GetPanelData extends Operator {
  _builtIn = true;

  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "get_panel_data",
      label: "Get panel data",
      unlisted: true,
    });
  }

  async resolveInput() {
    const inputs = new types.Object();

    inputs.str("id", { label: "Panel ID" });
    inputs.str("name", { label: "Panel Name" });

    return new types.Property(inputs);
  }

  useHooks(): GetPanelDataHooks {
    const openedGridPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
    const sampleViewPanels = useAtomValue(sampleViewPanelsControllerAtom);
    const [panelsData] = usePanelsState(true);

    const openedPanels = openedPanelRefs(openedGridPanels, sampleViewPanels);

    return { openedPanels, panelsData };
  }

  async execute(ctx: ExecutionContext<GetPanelDataParams, GetPanelDataHooks>) {
    const { hooks, params } = ctx;
    const { openedPanels, panelsData } = hooks;
    const { id, name } = params;

    let computedId = id;

    if (!computedId) {
      computedId = openedPanels.find((panel) => panel.type === name)?.id;
    }

    if (!computedId) {
      throw new Error("Panel not found");
    }

    return panelsData[computedId];
  }
}
