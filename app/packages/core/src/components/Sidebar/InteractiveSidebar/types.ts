import type { SidebarEntry } from "@fiftyone/state";
import type { Controller } from "@react-spring/web";

export type InteractiveItems = {
  [key: string]: {
    el: null | HTMLDivElement;
    controller: Controller;
    entry: SidebarEntry;
    active: boolean;
  };
};

export type RenderEntry = (
  key: string,
  group: string,
  entry: SidebarEntry,
  controller: Controller,
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void
) => { children: React.ReactNode; disabled?: boolean };
