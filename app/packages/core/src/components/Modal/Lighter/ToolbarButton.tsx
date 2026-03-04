import {
  Anchor,
  Clickable,
  Icon,
  IconName,
  Size,
  Tooltip,
} from "@voxel51/voodo";

export interface ToolbarButtonProps {
  tooltip: string;
  icon: IconName;
  onClick: () => void;
}

const ToolbarButton = ({ tooltip, icon, onClick }: ToolbarButtonProps) => (
  <Tooltip content={tooltip} anchor={Anchor.Top} portal>
    <Clickable onClick={onClick}>
      <Icon name={icon} size={Size.Lg} />
    </Clickable>
  </Tooltip>
);

export default ToolbarButton;
