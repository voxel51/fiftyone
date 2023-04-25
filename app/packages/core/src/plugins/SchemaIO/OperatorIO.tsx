import React, { useState } from "react";
import { Box } from "@mui/material";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { SchemaIOComponent } from ".";
import { types } from "@fiftyone/operators";
import { log, operatorToIOSchema } from "./utils";
import { getErrorsByPath } from "./utils/operator";
import { TabsView } from "./components";
import inputSchema from "./fixtures/input.json";
import { schema as outputSchema, data } from "./fixtures/output.json";

// Panel enabled only in development environment for testing and debugging SchemaIO
if (import.meta.env.MODE === "development") {
  registerComponent({
    name: "OperatorIO",
    label: "OperatorIO",
    component: OperatorIO,
    type: PluginComponentType.Panel,
    activator: () => true,
  });
}

registerComponent({
  name: "OperatorIOComponent",
  label: "OperatorIOComponent",
  component: OperatorIOComponent,
  type: PluginComponentType.Component,
  activator: () => true,
});

function OperatorIO() {
  const [mode, setMode] = useState("input");
  const input = types.Property.fromJSON(inputSchema);
  const ioSchema = operatorToIOSchema(input);
  const output = types.Property.fromJSON(outputSchema);
  const oSchema = operatorToIOSchema(output, { isOutput: true });

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ pb: 2 }}>
        <TabsView
          onChange={(path, mode) => setMode(mode)}
          schema={{
            default: "input",
            view: {
              choices: [
                { value: "input", label: "Input" },
                { value: "output", label: "Output" },
              ],
            },
          }}
        />
      </Box>
      {mode === "input" && (
        <SchemaIOComponent schema={ioSchema} onChange={log} />
      )}
      {mode === "output" && (
        <SchemaIOComponent schema={oSchema} onChange={log} data={data} />
      )}
    </Box>
  );
}

function OperatorIOComponent(props) {
  const { schema, onChange, type, data, errors } = props;
  const ioSchema = operatorToIOSchema(schema, { isOutput: type === "output" });

  return (
    <SchemaIOComponent
      schema={ioSchema}
      onChange={onChange}
      data={data}
      errors={getErrorsByPath(errors)}
    />
  );
}
