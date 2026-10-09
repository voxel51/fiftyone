import ActionButton from "../ActionButton";
import { sidebarVisible } from "@fiftyone/state";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "@voxel51/voodo";
import { useReverbState } from "@fiftyone/reverb";
import type { ActionProps } from "../types";

const ToggleSidebar = ({ modal }: ActionProps & { modal: boolean }) => {
  const [visible, setVisible] = useReverbState(sidebarVisible(modal));
  const [close, open] = modal
    ? [PanelRightCloseIcon, PanelRightOpenIcon]
    : [PanelLeftCloseIcon, PanelLeftOpenIcon];

  return (
    <ActionButton
      onClick={() => {
        setVisible(!visible);
      }}
      title={`${visible ? "Hide" : "Show"} sidebar (s)`}
      tooltipPlacement={modal ? "bottom" : "top"}
      icon={visible ? close : open}
      highlight={!visible}
      data-cy="action-toggle-sidebar"
    />
  );
};

export default ToggleSidebar;
