import {
  Anchor,
  Clickable,
  Icon,
  IconName,
  Size,
  Tooltip,
} from "@voxel51/voodo";

export interface ToolbarButtonProps {
  content: string;
  icon: IconName;
  onClick: () => void;
}

const ToolbarButton = ({ content, icon, onClick }: ToolbarButtonProps) => (
  <Tooltip content={content} anchor={Anchor.Top} portal>
    <Clickable onClick={onClick}>
      <Icon name={icon} size={Size.Lg} />
    </Clickable>
  </Tooltip>
);

export default ToolbarButton;
