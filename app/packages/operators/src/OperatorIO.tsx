import { Box } from "@mui/material";
import { useActivePlugins } from "@fiftyone/plugins";
import { PluginComponentType } from "@fiftyone/plugins";

export default function OperatorIO(props) {
  const componentPlugins = useActivePlugins(PluginComponentType.Component, {});
  const OperatorIOComponent = componentPlugins.find(
    ({ name }) => name === "OperatorIOComponent"
  ).component;
  return (
    <Box sx={{ p: 2 }}>
      <OperatorIOComponent {...props} />
    </Box>
  );
}
