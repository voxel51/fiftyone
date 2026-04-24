import { useAIAnnotationMode } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAIAnnotationMode";
import { Fragment } from "react";
import { AIAnnotationToolbarGroup } from "./AIAnnotationToolbarGroup";
import {
  Icon,
  IconName,
  Orientation,
  Size,
  Toolbar,
  ToolbarAction,
  ToolbarGroup,
} from "@voxel51/voodo";

export const AIAnnotationToolbar = () => {
  const { isActive } = useAIAnnotationMode();

  if (!isActive) {
    return <Fragment />;
  }

  return (
    <Toolbar orientation={Orientation.Column} xOffset={60} yOffset={400}>
      <ToolbarGroup>
        <ToolbarAction>
          <Icon size={Size.Lg} name={IconName.Inspect} />
        </ToolbarAction>
      </ToolbarGroup>

      <AIAnnotationToolbarGroup />

      <ToolbarGroup>
        <ToolbarAction>
          <Icon size={Size.Lg} name={IconName.Polyline} />
        </ToolbarAction>
        <ToolbarAction>
          <Icon size={Size.Lg} name={IconName.Draw} />
        </ToolbarAction>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarAction>
          <Icon size={Size.Lg} name={IconName.ContentCopy} />
        </ToolbarAction>
      </ToolbarGroup>
    </Toolbar>
  );
};
