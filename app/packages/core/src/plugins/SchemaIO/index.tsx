import { SchemaIOComponent as SchemaIO } from "./SchemaIOComponent";
import SmartForm from "../../../../components/src/components/SmartForm";

const SIO = false;

export function SchemaIOComponent(props) {
  if (SIO) {
    return <SchemaIO {...props} />;
  } else {
    return (
      <SmartForm
        schema={props.schema}
        data={props.data}
        onChange={(data) => {
          console.log("[SmartForm Change]", data);
          if (props.onChange) {
            props.onChange(data);
          }
        }}
        onSubmit={(data) => {
          console.log("[SmartForm Submit]", data);
          if (props.onChange) {
            props.onChange(data);
          }
        }}
      />
    );
  }
}
