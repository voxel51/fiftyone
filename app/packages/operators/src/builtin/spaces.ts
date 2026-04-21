import { usePanels, useSpaceNodes } from "@fiftyone/spaces";
import { constants, isModalActive } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { Operator, OperatorConfig } from "../operators";
import * as types from "../types";

import type {
  ExecutionContext,
  ListOpenPanelsHooks,
  ListOpenPanelsItemType,
  ListPanelItemType,
  ListPanelsHooks,
  ListPanelsParams,
} from "../ts";

const { FIFTYONE_GRID_SPACES_ID, FIFTYONE_MODAL_SPACES_ID } = constants;

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
    ctx: ExecutionContext<ListPanelsParams, ListPanelsHooks>
  ): Promise<ListPanelItemType[]> {
    const { hooks, params } = ctx;
    const { panels } = hooks;
    const { surface } = params;

    if (surface === "modal") {
      return panels.filter((panel) =>
        panel.panelOptions?.surfaces?.includes("modal")
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
    const openedModalPanels = useSpaceNodes(FIFTYONE_MODAL_SPACES_ID);
    const panels = usePanels();

    return { isModalOpen, openedGridPanels, openedModalPanels, panels };
  }

  async execute(
    ctx: ExecutionContext<void, ListOpenPanelsHooks>
  ): Promise<ListOpenPanelsItemType[]> {
    const { hooks } = ctx;
    const { isModalOpen, openedGridPanels, openedModalPanels, panels } = hooks;

    const panelsByName = panels.reduce((panelsMap, panel) => {
      panelsMap[panel.name] = panel;
      return panelsMap;
    }, {});

    const openPanels = isModalOpen ? openedModalPanels : openedGridPanels;

    return openPanels
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
