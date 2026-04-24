import { usePointSelection } from "./hooks";
import {
  Icon,
  IconName,
  Size,
  ToolbarAction,
  ToolbarGroup,
} from "@voxel51/voodo";

/**
 * {@link ToolbarGroup} which handles AI-assisted annotation tooling.
 */
export const AIAnnotationToolbarGroup = () => {
  const pointSelection = usePointSelection();

  return (
    <ToolbarGroup>
      <ToolbarAction
        active={pointSelection.isActive}
        onClick={() => {
          if (pointSelection.isActive) {
            pointSelection.deactivate();
          } else {
            pointSelection.activate();
          }
        }}
        title="AI Segment"
      >
        <Icon size={Size.Lg} name={IconName.AI} />
      </ToolbarAction>
    </ToolbarGroup>
  );
};
