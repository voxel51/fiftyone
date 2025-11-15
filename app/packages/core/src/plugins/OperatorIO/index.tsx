import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { SchemaIOComponent } from "../SchemaIO";
import { getErrorsByPath, operatorToIOSchema } from "./utils";

function OperatorIOComponent(props) {
  const {
    schema,
    onChange,
    type,
    data,
    errors,
    layout,
    onPathChange,
    initialData,
    id,
    shouldClearUseKeyStores,
    onValidationErrors,
    ...otherProps
  } = props;
  const ioSchema = operatorToIOSchema(schema, { isOutput: type === "output" });

  return (
    <SchemaIOComponent
      id={id}
      shouldClearUseKeyStores={shouldClearUseKeyStores}
      schema={ioSchema}
      onChange={onChange}
      onPathChange={onPathChange}
      data={data}
      errors={getErrorsByPath(errors)}
      initialData={initialData}
      layout={layout}
      onValidationErrors={onValidationErrors}
      otherProps={otherProps}
    />
  );
}

registerComponent({
  name: "OperatorIOComponent",
  label: "OperatorIOComponent",
  component: OperatorIOComponent,
  type: PluginComponentType.Component,
  activator: () => true,
});

// Panel for testing and debugging
import "./examples/Panel";
