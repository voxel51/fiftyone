/**
 * TODO: FOR TESTING ONLY, REMOVE
 */

import React from "react";
import { Box } from "@mui/material";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { SchemaIOComponent } from ".";
import { types } from "@fiftyone/operators";
import annotation from "./fixtures/annotation.json";
import { log, operatorToIOSchema } from "./utils";

registerComponent({
  name: "OperatorIO",
  label: "OperatorIO",
  component: OperatorIO,
  type: PluginComponentType.Panel,
  activator: () => true,
});

function OperatorIO() {
  const input = types.Property.fromJSON(annotation);
  const ioSchema = operatorToIOSchema(input);

  return (
    <Box sx={{ p: 4 }}>
      <SchemaIOComponent schema={ioSchema} onChange={log} />
    </Box>
  );
}
