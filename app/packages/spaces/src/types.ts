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
  activeChild?: SpaceNode["activeChild"];
  children: Array<SpaceNodeJSON>;
  id: SpaceNode["id"];
  layout?: SpaceNode["layout"];
  type?: SpaceNode["type"];
  pinned?: SpaceNode["pinned"];
};

export type PanelProps = {
  node: SpaceNode;
  spaceId: string;
};

export type PanelTabProps = {
  node: SpaceNode;
  active?: boolean;
  spaceId: string;
};

export type SpaceProps = {
  node: SpaceNode;
  id: string;
};

export type PanelStateParameter = {
  panelId: string;
  local?: boolean;
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
