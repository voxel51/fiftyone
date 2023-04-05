import React from "react";
import { Typography } from "@mui/material";
import ObjectView from "./ObjectView";
import RadioView from "./RadioView";
import DropdownView from "./DropdownView";
import CheckboxView from "./CheckboxView";
import FieldView from "./FieldView";
import ListView from "./ListView";

export default function DynamicIO(props) {
  const { schema, onChange, path } = props;
  const Component = getComponent(schema);
  return <Component schema={schema} onChange={onChange} path={path} />;
}

const componentsMap = {
  ObjectView: ObjectView,
  CheckboxView: CheckboxView,
  FieldView: FieldView,
  ListView: ListView,
  RadioView: RadioView,
  DropdownView: DropdownView,
  UnsupportedView: UnsupportedView,
};

function getComponent(schema) {
  const { component } = schema?.view || {};
  return componentsMap[component] || UnsupportedView;
}

function UnsupportedView(props) {
  console.error("UnsupportedView", { props });
  return <Typography>Unsupported</Typography>;
}
