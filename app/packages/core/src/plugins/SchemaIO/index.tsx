import { SchemaIOComponent as SchemaIO } from "./SchemaIOComponent";
import SmartForm from "../../../../components/src/components/SmartForm";

const SIO = false;

export function SchemaIOComponent(props) {
  if (SIO) {
    return <SchemaIO {...props} />;
  } else {
    return <SmartForm {...props} />;
  }
}
