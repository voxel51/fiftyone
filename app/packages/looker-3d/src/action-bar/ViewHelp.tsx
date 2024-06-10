import { HelpIcon } from "@fiftyone/components";
import { useHelpPanel } from "@fiftyone/state";
import { ACTION_VIEW_HELP } from "../constants";
import { ActionItem } from "../containers";

export const LOOKER3D_HELP_ITEMS = [
  { shortcut: "Left drag", title: "Rotate", detail: "Rotate the camera" },
  { shortcut: "T", title: "Top-down", detail: "Reset camera to top-down view" },
  {
    shortcut: "Ctrl + left drag / Wheel",
    title: "Zoom",
    detail: "Zoom in and out",
  },
  { shortcut: "E", title: "Ego-view", detail: "Reset the camera to ego view" },
  {
    shortcut: "Shift + left drag / Right drag",
    title: "Translate",
    detail: "Translate the camera",
  },
  { shortcut: "B", title: "Background", detail: "Toggle background" },
  { shortcut: "C", title: "Controls", detail: "Toggle controls" },
  { shortcut: "G", title: "Grid", detail: "Toggle grid" },
  { shortcut: "F", title: "Full-screen", detail: "Toggle full-screen" },
  { shortcut: "J", title: "Json ", detail: "Toggle JSON view" },
  { shortcut: "I", title: "FO3D ", detail: "Toggle FO3D JSON view" },
  { shortcut: "?", title: "Display help", detail: "Display this help window" },
  { shortcut: "ESC", title: "Escape ", detail: "Escape the current context" },
];

export const ViewHelp = (props: {
  helpPanel: ReturnType<typeof useHelpPanel>;
}) => {
  const { helpPanel } = props;

  return (
    <>
      <ActionItem>
        <HelpIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={(e) => {
            helpPanel.toggle(LOOKER3D_HELP_ITEMS);
            e.stopPropagation();
            e.preventDefault();
            return false;
          }}
          data-for-panel={ACTION_VIEW_HELP}
        />
      </ActionItem>
    </>
  );
};
