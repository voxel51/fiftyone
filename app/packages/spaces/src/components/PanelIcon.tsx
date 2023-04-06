import ExtensionIcon from "@mui/icons-material/Extension";
import { usePanel } from "../hooks";
import { PanelIconProps } from "../types";
import { warnPanelNotFound } from "../utils";

export default function PanelIcon(props: PanelIconProps) {
  const { name } = props;
  const panel = usePanel(name);
  if (!panel) return warnPanelNotFound(name);
  const { Icon } = panel;
  const PanelTabIcon = Icon || ExtensionIcon;
  return (
    <PanelTabIcon
      style={{
        width: "1rem",
        height: "1rem",
        marginRight: "0.5rem",
      }}
    />
  );
}
