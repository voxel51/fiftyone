import { SchemaIOComponent as SchemaIO } from "./SchemaIOComponent";
import SmartForm, {
  isJSONSchema,
  type SmartFormProps,
} from "../../../../components/src/components/SmartForm";
import type { SchemaType } from "./utils/types";
import type { RJSFSchema } from "@rjsf/utils";

export interface SchemaIOComponentProps {
  schema: SchemaType | RJSFSchema;
  data?: unknown;
  id?: string;
  useJSONSchema?: boolean;
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

  // RJSF only
  onSubmit?: (data: unknown) => void;
  uiSchema?: SmartFormProps["uiSchema"];
  validator?: SmartFormProps["validator"];
}

export function SchemaIOComponent(props: SchemaIOComponentProps) {
  if (props.useJSONSchema || isJSONSchema(props.schema)) {
    return <SmartForm {...props} schema={props.schema as SchemaType} />;
  } else {
    return <SchemaIO {...props} />;
  }
}
