import { HelpIcon } from "@fiftyone/components";
import type { useHelpPanel } from "@fiftyone/state";
import { ACTION_VIEW_HELP } from "../constants";
import { ActionItem } from "../containers";

export const LOOKER3D_HELP_ITEMS = [
  // Camera Views Section
  {
    key: "views",
    shortcut: "1",
    title: "Top view",
    detail: "Switch to top view",
  },
  {
    key: "views",
    shortcut: "⌘ + 1",
    title: "Bottom view",
    detail: "Switch to bottom view",
  },
  {
    key: "views",
    shortcut: "2",
    title: "Right view",
    detail: "Switch to right view",
  },
  {
    key: "views",
    shortcut: "⌘ + 2",
    title: "Left view",
    detail: "Switch to left view",
  },
  {
    key: "views",
    shortcut: "3",
    title: "Front view",
    detail: "Switch to front view",
  },
  {
    key: "views",
    shortcut: "⌘ + 3",
    title: "Back view",
    detail: "Switch to back view",
  },
  {
    key: "views",
    shortcut: "4",
    title: "Annotation plane view 1",
    detail: "Switch to annotation plane view 1 (orthogonal to plane)",
  },
  {
    key: "views",
    shortcut: "⌘ + 4",
    title: "Annotation plane view 2",
    detail: "Switch to annotation plane view 2 (orthogonal to plane)",
  },
  {
    key: "views",
    shortcut: "T",
    title: "Top-down",
    detail: "Reset camera to top-down view",
  },
  {
    key: "views",
    shortcut: "E",
    title: "Ego-view",
    detail: "Reset the camera to ego view",
  },
  // Camera Controls (General section)
  {
    key: "general",
    shortcut: "Left drag",
    title: "Rotate",
    detail: "Rotate the camera",
  },
  {
    key: "general",
    shortcut: "Ctrl + left drag / Wheel",
    title: "Zoom",
    detail: "Zoom in and out",
  },
  {
    key: "general",
    shortcut: "Shift + left drag / Right drag",
    title: "Translate",
    detail: "Translate the camera",
  },
  // General Shortcuts
  {
    key: "general",
    shortcut: "B",
    title: "Background",
    detail: "Toggle background",
  },
  {
    key: "general",
    shortcut: "C",
    title: "Controls",
    detail: "Toggle controls",
  },
  {
    key: "general",
    shortcut: "G",
    title: "Grid",
    detail: "Toggle grid",
  },
  {
    key: "general",
    shortcut: "Z",
    title: "Crop",
    detail: "Crop and set camera look-at on visible labels",
  },
  {
    key: "general",
    shortcut: "F",
    title: "Full-screen",
    detail: "Toggle full-screen",
  },
  {
    key: "general",
    shortcut: "J",
    title: "Json ",
    detail: "Toggle JSON view",
  },
  {
    key: "general",
    shortcut: "I",
    title: "FO3D ",
    detail: "Toggle FO3D JSON view",
  },
  {
    key: "general",
    shortcut: "R",
    title: "Render Preferences",
    detail: "Toggle render preferences",
  },
  {
    key: "general",
    shortcut: "?",
    title: "Display help",
    detail: "Display this help window",
  },
  {
    key: "general",
    shortcut: "ESC",
    title: "Escape ",
    detail: "Escape the current context",
  },
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
