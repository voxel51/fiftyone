import { FormProps } from "@rjsf/core";
import SmartForm from "../../../../components/src/components/SmartForm";
import { SmartFormProps } from "../../../../components/src/components/SmartForm/types";
import { SchemaIOComponent as SchemaIO } from "./SchemaIOComponent";
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
  smartFormProps?: FormProps;
}

export function SchemaIOComponent(props: SchemaIOComponentProps) {
  const {
    onSubmit,
    jsonSchema,
    uiSchema,
    smartFormProps,
    shouldClearUseKeyStores,
    onPathChange,
    ...commonProps
  } = props;

  if (props.smartForm || props.jsonSchema) {
    return (
      <SmartForm
        formProps={smartFormProps}
        onSubmit={onSubmit}
        jsonSchema={jsonSchema}
        uiSchema={uiSchema}
        {...commonProps}
      />
    );
  } else {
    return (
      <SchemaIO
        shouldClearUseKeyStores={shouldClearUseKeyStores}
        onPathChange={onPathChange}
        {...commonProps}
      />
    );
  }
}
