import { EnumType } from "typescript";
import type { PluginComponentRegistration } from "@fiftyone/plugins";
import SpaceNode from "./SpaceNode";
import { Layout, PANEL_AREA } from "./enums";

export type SpacesRootProps = {
  id: string;
  defaultState?: SpaceNodeJSON;
};

export type AddPanelItemProps = {
  node: SpaceNode;
  name: SpaceNodeType;
  label: string;
  Icon?: React.ComponentType;
  onClick?: () => void;
  spaceId: string;
  showAlpha?: boolean;
  showBeta?: boolean;
  showNew?: boolean;
};

export type PanelIconProps = {
  name: SpaceNodeType;
};

export type SpaceNodeType = EnumType | string;

export type AddPanelButtonProps = {
  node: SpaceNode;
  spaceId: string;
};

export type SplitPanelButtonProps = {
  node: SpaceNode;
  layout: Layout;
  spaceId: string;
};

export type SpaceNodeJSON = {
  id: SpaceNode["id"];
  activeChild?: SpaceNode["activeChild"];
  children?: Array<SpaceNodeJSON>;
  layout?: SpaceNode["layout"];
  type?: SpaceNode["type"];
  pinned?: SpaceNode["pinned"];
  sizes?: number[];
  _name?: string;
  // ordering stamp for the two-way session sync (see MainSpace)
  _version?: number;
};

export type PanelProps = {
  node: SpaceNode;
  spaceId?: string;
  isModalPanel?: boolean;
  style?: React.CSSProperties;
};

export type PanelTabProps = {
  node: SpaceNode;
  active?: boolean;
  spaceId: string;
};

export type SpaceProps = {
  node: SpaceNode;
  id: string;
  archetype?: "grid" | "modal";
};

export type PanelStateParameter = {
  panelId: string;
  local?: boolean;
  scope?: string;
};

export type PanelStatePartialParameter = PanelStateParameter & {
  key: string;
};

export type PanelsStateObject = {
  [key: string]: unknown;
};

export type PanelsCloseEffect = {
  [panelId: string]: () => void;
};

export type PanelIdToScopeType = {
  [panelId: string]: string;
};

export type PanelRendererProps = {
  name: string;
  id: string;
};

export type PanelAreaProps = {
  id: PANEL_AREA;
  /** The legacy panel placement string associated with this host area. */
  placement: string;
  /**
   * Host-owned context eligibility. Spaces remains independent of operator
   * scope definitions by accepting a predicate instead of an operator type.
   */
  isPanelEligible?: (panel: PluginComponentRegistration) => boolean;
  /** Enable the one-off renderer compatibility adapter for the right sidebar. */
  legacySupport?: "right-sidebar";
  resize?: {
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    direction: "left" | "right";
  };
};
