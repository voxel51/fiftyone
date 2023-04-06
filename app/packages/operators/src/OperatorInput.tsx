import { Box } from "@mui/material";
import { useActivePlugins } from "@fiftyone/plugins";
import { PluginComponentType } from "@fiftyone/plugins";

export default function OperatorInput(props) {
  const componentPlugins = useActivePlugins(PluginComponentType.Component, {});
  const OperatorIO = componentPlugins.find(
    ({ name }) => name === "OperatorIOComponent"
  ).component;
  const { schema, onChange, formData, onError } = props;
  return (
    <Box sx={{ p: 2 }}>
      <OperatorIO schema={schema} onChange={onChange} />
    </Box>
  );
}
