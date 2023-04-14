import { Box } from "@mui/material";
import { useActivePlugins } from "@fiftyone/plugins";
import { PluginComponentType } from "@fiftyone/plugins";

export default function OperatorIO(props) {
  const componentPlugins = useActivePlugins(PluginComponentType.Component, {});
  const OperatorIOComponent = componentPlugins.find(
    ({ name }) => name === "OperatorIOComponent"
  ).component;
  const { schema, onChange, data, onError, type } = props;
  return (
    <Box sx={{ p: 2 }}>
      <OperatorIOComponent
        schema={schema}
        onChange={onChange}
        type={type}
        data={data}
      />
    </Box>
  );
}
