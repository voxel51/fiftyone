import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import React from "react";
import { SchemaIOComponent } from "../SchemaIO";
import { getErrorsByPath, operatorToIOSchema } from "./utils";

function OperatorIOComponent(props) {
  const { schema, onChange, type, data, errors, layout, onPathChange } = props;
  const ioSchema = operatorToIOSchema(schema, { isOutput: type === "output" });

  return (
    <SchemaIOComponent
      schema={ioSchema}
      onChange={onChange}
      onPathChange={onPathChange}
      data={data}
      errors={getErrorsByPath(errors)}
      layout={layout}
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
