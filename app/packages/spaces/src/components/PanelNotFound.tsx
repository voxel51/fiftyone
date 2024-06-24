import { usePluginComponent } from "@fiftyone/plugins";
import { Typography } from "@mui/material";
import { PanelProps } from "../types";

export default function PanelNotFound(props: PanelNotFoundPropsType) {
  const { panelName } = props;
  const CustomPanelNotFound = usePluginComponent("PanelNotFound")?.component;

  if (CustomPanelNotFound) {
    return <CustomPanelNotFound {...props} />;
  }

  return (
    <Typography>Panel &quot;{panelName}&quot; no longer exists!</Typography>
  );
}

type PanelNotFoundPropsType = PanelProps & { panelName: string };
