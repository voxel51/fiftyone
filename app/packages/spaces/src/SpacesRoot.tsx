import { Space } from "./components";
import { useSpaces } from "./hooks";
import { SpacesRootProps } from "./types";

export default function SpacesRoot(props: SpacesRootProps) {
  const { id, defaultState } = props;
  const { spaces } = useSpaces(id, defaultState);
  return <Space node={spaces.root} id={id} />;
}

type PanelIconProps = {
  name: string;
};

function PanelIcon(props: PanelIconProps) {
  const { name } = props;
  const panel = usePanel(name);
  if (!panel) panelNotFoundError(name);
  const { Icon } = panel;
  const PanelTabIcon = Icon || ExtensionIcon;
  return (
    <PanelTabIcon
      style={{ width: "1rem", height: "1rem", marginRight: "0.5rem" }}
    />
  );
}

function PanelTab({ node, active, spaceId }: PanelTabProps) {
  const { spaces } = useSpaces(spaceId);
  const panelName = node.type;
  const panel = usePanel(panelName);
  if (!panel) panelNotFoundError(panelName);
  return (
    <StyledTab
      onClick={() => {
        if (!active) spaces.setNodeActive(node);
      }}
      active={active}
    >
      <PanelIcon name={panelName as string} />
      {panel.label}
      {!node.pinned && (
        <StyleCloseButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            spaces.removeNode(node);
          }}
        >
          x
        </StyleCloseButton>
      )}
    </StyledTab>
  );
}
/**
 *
 *  ---------- Styled Components ----------
 *
 */

const SpaceContainer = styled.div`
  display: flex;
`;
const PanelContainer = styled.div`
  flex: 1;
`;
const PanelTabs = styled.div`
  display: flex;
  background: #252525;
  padding-bottom: 0px;
`;

const StyledPanel = styled.div``;

const GhostButton = styled.button`
  cursor: pointer;
  background: none;
  border: none;
  margin: 4px;
  margin-left: 8px;
  padding: 0px 12px 4px 12px;
  color: #9e9e9e;
  border-radius: 4px;
  color: #fff;
  transition: background ease 0.25s;
  &:hover {
    background: #454545;
  }
`;

const AddPanelButtonContainer = styled.div`
  position: relative;
`;

const StyledPanelItem = styled.div`
  cursor: pointer;
  padding: 4px 8px;
  transition: background ease 0.25s;
  &:hover {
    background: #2b2b2b;
  }
`;

const StyledTab = styled.button<{ active?: boolean }>`
  display: flex;
  align-items: center;
  cursor: ${(props) => (props.active ? "default" : "pointer")};
  background: ${(props) => (props.active ? "#1a1a1a" : "#2c2c2c")};
  border: none;
  color: #fff;
  padding: 0px 12px 4px 12px;
  :hover {
    background: ${(props) => (props.active ? "#1a1a1a" : "hsl(0deg 0% 13%)")};
  }
`;

const StyleCloseButton = styled.button`
  cursor: pointer;
  border: none;
  padding: 2.5px 6px;
  margin-left: 6px;
  background: none;
  color: #fff;
  border-radius: 4px;
  &:hover {
    background: #454545;
  }
`;

/**
 *
 *  ---------- Types ----------
 *
 */

type SpaceNodeType = EnumType | string;

type AddPanelButtonProps = {
  node: SpaceNode;
  spaceId: string;
};

type SplitPanelButtonProps = {
  node: SpaceNode;
  layout: Layout;
  spaceId: string;
};

type SpaceNodeJSON = {
  activeChild: SpaceNode["activeChild"];
  children: Array<SpaceNodeJSON>;
  id: SpaceNode["id"];
  layout: SpaceNode["layout"];
  type?: SpaceNode["type"];
  pinned?: SpaceNode["pinned"];
};

type PanelProps = {
  node: SpaceNode;
};

type PanelTabProps = {
  node: SpaceNode;
  active?: boolean;
  spaceId: string;
};

type SpaceProps = {
  node: SpaceNode;
  id: string;
};
