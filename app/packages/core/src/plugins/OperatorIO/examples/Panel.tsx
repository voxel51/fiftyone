import { types } from "@fiftyone/operators";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { Box } from "@mui/material";
import React, { useEffect, useState } from "react";
import { SchemaIOComponent } from "../../SchemaIO";
import { TabsView } from "../../SchemaIO/components";
import { log, operatorToIOSchema } from "../utils";
import {
  errors as inputErrors,
  schema as inputSchema,
  simpleSchema,
} from "./input.json";
import { data, schema as outputSchema } from "./output.json";

// Panel enabled only in development environment for testing and debugging SchemaIO
if (import.meta.env?.MODE === "development") {
  registerComponent({
    name: "OperatorIO",
    label: "OperatorIO",
    component: OperatorIO,
    type: PluginComponentType.Panel,
    activator: () => true,
  });
}

function OperatorIO() {
  const [mode, setMode] = useState("input");
  const input = types.Property.fromJSON(inputSchema);
  const ioSchema = operatorToIOSchema(input);
  const output = types.Property.fromJSON(outputSchema);
  const oSchema = operatorToIOSchema(output, { isOutput: true });
  const simple = types.Property.fromJSON(simpleSchema);
  const sSchema = operatorToIOSchema(simple);
  const [state, setState] = useState(data);

  useEffect(() => {
    if (mode === "output") {
      if (state.linear < 1) {
        setTimeout(() => {
          setState((state) => ({ ...state, linear: state.linear + 0.05 }));
        }, 500);
      }
      if (state.circular < 1) {
        setTimeout(() => {
          setState((state) => ({ ...state, circular: state.circular + 0.05 }));
        }, 500);
      }
    }
  }, [mode, state]);

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ pb: 2 }}>
        <TabsView
          onChange={(path, mode) => {
            setMode(mode);
            setState({ ...state, linear: 0, circular: 0 });
          }}
          schema={{
            default: "input",
            view: {
              choices: [
                { value: "input", label: "Input" },
                { value: "output", label: "Output" },
                { value: "inferred-input", label: "Inferred Input" },
              ],
            },
          }}
        />
      </Box>
      {mode === "input" && (
        <SchemaIOComponent
          schema={ioSchema}
          onChange={log}
          errors={inputErrors}
        />
      )}
      {mode === "output" && (
        <SchemaIOComponent schema={oSchema} onChange={log} data={state} />
      )}
      {mode === "inferred-input" && (
        <SchemaIOComponent schema={sSchema} onChange={log} />
      )}
    </Box>
  );
}
