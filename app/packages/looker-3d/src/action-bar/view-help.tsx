import { HelpIcon } from "@fiftyone/components";
import { useHelpPanel } from "@fiftyone/state";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import { ACTION_VIEW_HELP, currentActionAtom } from "../state";

const LOOKER3D_HELP_ITEMS = [
  { shortcut: "Wheel", title: "Zoom", detail: "Zoom in and out" },
  { shortcut: "Drag", title: "Rotate", detail: "Rotate the camera" },
  {
    shortcut: "Shift + drag",
    title: "Translate",
    detail: "Translate the camera",
  },
  { shortcut: "T", title: "Top-down", detail: "Reset camera to top-down view" },
  { shortcut: "E", title: "Ego-view", detail: "Reset the camera to ego view" },
  { shortcut: "C", title: "Controls", detail: "Toggle controls" },
  { shortcut: "?", title: "Display help", detail: "Display this help window" },
  { shortcut: "ESC", title: "Escape ", detail: "Escape the current context" },
];

export const ViewHelp = (props: {
  helpPanel: ReturnType<typeof useHelpPanel>;
}) => {
  const { helpPanel } = props;

  const [currentAction, setAction] = recoil.useRecoilState(currentActionAtom);

  return (
    <>
      <ActionItem>
        <HelpIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={(e) => {
            const targetAction = ACTION_VIEW_HELP;
            const nextAction =
              currentAction === targetAction ? null : targetAction;
            setAction(nextAction);
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
