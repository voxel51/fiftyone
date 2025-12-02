import { SchemaIOComponent as SchemaIO } from "./SchemaIOComponent";
import SmartForm, {
  type SmartFormProps,
} from "../../../../components/src/components/SmartForm";
import type { SchemaType } from "./utils/types";

export interface SchemaIOComponentProps {
  schema: SchemaType;
  data?: unknown;
  id?: string;
  smartForm?: boolean;
  onChange?: (data: unknown, liteValues?: Record<string, unknown>) => void;

  // SchemaIO only
  shouldClearUseKeyStores?: boolean;
  onPathChange?: (
    path: string,
    value: unknown,
    schema?: SchemaType,
    updatedState?: unknown,
    liteValue?: unknown
  ) => void;

  // SmartForm only
  onSubmit?: (data: unknown) => void;
  jsonSchema?: SmartFormProps["jsonSchema"];
  uiSchema?: SmartFormProps["uiSchema"];
}

export function SchemaIOComponent(props: SchemaIOComponentProps) {
  if (props.smartForm || props.jsonSchema) {
    return <SmartForm {...props} />;
  } else {
    return <SchemaIO {...props} />;
  }
}
