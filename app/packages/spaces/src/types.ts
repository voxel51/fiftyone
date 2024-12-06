import { EnumType } from "typescript";
import SpaceNode from "./SpaceNode";
import { Layout } from "./enums";

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
};

export type PanelProps = {
  node: SpaceNode;
  spaceId: string;
  isModalPanel?: boolean;
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
