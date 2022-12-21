import ExtensionIcon from "@mui/icons-material/Extension";
import { usePanel } from "../hooks";
import { PanelIconProps } from "../types";
import { panelNotFoundError } from "../utils";

export default function PanelIcon(props: PanelIconProps) {
  const { name } = props;
  const panel = usePanel(name);
  if (!panel) return panelNotFoundError(name);
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
