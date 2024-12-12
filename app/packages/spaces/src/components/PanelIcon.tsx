import ExtensionIcon from "@mui/icons-material/Extension";
import { usePanel } from "../hooks";
import { PanelIconProps } from "../types";
import { warnPanelNotFound } from "../utils";
import { Box } from "@mui/material";

export default function PanelIcon(props: PanelIconProps) {
  const { name } = props;
  const panel = usePanel(name);
  if (!panel) return warnPanelNotFound(name);
  const { Icon } = panel;
  const PanelTabIcon = Icon || ExtensionIcon;
  return (
    <Box sx={{ mr: "0.75rem", width: "1rem", height: "1.5rem" }}>
      <PanelTabIcon
        style={{
          width: "1rem",
          height: "1rem",
        }}
      />
    </Box>
  );
}
