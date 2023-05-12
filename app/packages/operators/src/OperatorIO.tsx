import { Box } from "@mui/material";
import { useActivePlugins, PluginComponentType } from "@fiftyone/plugins";

export default function OperatorIO(props) {
  const { schema } = props;
  const componentPlugins = useActivePlugins(PluginComponentType.Component, {});
  const OperatorIOComponent = componentPlugins.find(
    ({ name }) => name === "OperatorIOComponent"
  ).component;
  const schemaView = schema?.view;
  const schemaWithoutTitle = schemaView
    ? { ...schema, view: { ...schemaView, label: undefined } }
    : schema;
  return (
    <Box sx={{ p: 2 }}>
      <OperatorIOComponent {...props} schema={schemaWithoutTitle} />
    </Box>
  );
}
