import { SchemaIOComponent as SchemaIO } from "./SchemaIOComponent";
import SmartForm, {
  isJSONSchema,
} from "../../../../components/src/components/SmartForm";

export function SchemaIOComponent(props) {
  if (props.useJSONSchema || isJSONSchema(props.schema)) {
    return <SmartForm {...props} />;
  } else {
    return <SchemaIO {...props} />;
  }
}
