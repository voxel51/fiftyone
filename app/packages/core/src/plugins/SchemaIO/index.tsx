import { SchemaIOComponent as SchemaIO } from "./SchemaIOComponent";
import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";

const SIO = false;

export function SchemaIOComponent(props) {
  if (SIO) {
    return <SchemaIO {...props} />;
  } else {
    return (
      <Form
        schema={props.schema}
        uiSchema={{}}
        validator={validator}
        formData={props.data}
        onChange={({ formData }) => {
          console.log("[RJSF Change]", formData);
          if (props.onChange) {
            props.onChange(formData);
          }
        }}
        onSubmit={({ formData }) => {
          console.log("[RJSF Submit]", formData);
          if (props.onChange) {
            props.onChange(formData);
          }
        }}
      />
    );
  }
}
