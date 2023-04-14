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
import InferredView from "./components/InferredView";

registerComponent({
  name: "OperatorIO",
  label: "OperatorIO",
  component: OperatorIO,
  type: PluginComponentType.Panel,
  activator: () => true,
});

registerComponent({
  name: "OperatorIOComponent",
  label: "OperatorIOComponent",
  component: OperatorIOComponent,
  type: PluginComponentType.Component,
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

function OperatorIOComponent(props) {
  const { schema, onChange, type, data } = props;
  const ioSchema = operatorToIOSchema(schema);

  // todo: ...
  if (type === "output") return <InferredView label="Output" data={data} />;

  return <SchemaIOComponent schema={ioSchema} onChange={onChange} />;
}
