import validator from "@rjsf/validator-ajv8";
import Form from "@rjsf/mui";
import { templates, widgets } from "./RJSFOverrides";
import { Box } from "@mui/material";

const uiSchema = {
  "ui:submitButtonOptions": {
    norender: true,
  },
};

export default function OperatorInput(props) {
  const { schema, onChange, formData, onError } = props;
  return (
    <Box sx={{ p: 2 }}>
      <Form
        schema={schema}
        uiSchema={uiSchema}
        validator={validator}
        onChange={onChange}
        formData={formData}
        onError={onError}
        templates={templates}
        widgets={widgets}
      />
    </Box>
  );
}
