import validator from "@rjsf/validator-ajv8";
import Form from "@rjsf/mui";
import { templates, widgets } from "./RJSFOverrides";
import { Box } from "@mui/material";
import { useActivePlugins } from "@fiftyone/plugins";
import { PluginComponentType } from "@fiftyone/plugins";

const uiSchema = {
  "ui:submitButtonOptions": {
    norender: true,
  },
};

export default function OperatorInput(props) {
  const componentPlugins = useActivePlugins(PluginComponentType.Component, {});
  const OperatorIO = componentPlugins.find(
    ({ name }) => name === "OperatorIOComponent"
  ).component;
  const { schema, onChange, formData, onError, inputFields } = props;
  console.log(inputFields);
  return (
    <Box sx={{ p: 2 }}>
      <OperatorIO schema={inputFields} onChange={onChange} />
      {/* <Form
        schema={schema}
        uiSchema={uiSchema}
        validator={validator}
        onChange={onChange}
        formData={formData}
        onError={onError}
        templates={templates}
        widgets={widgets}
      /> */}
    </Box>
  );
}
