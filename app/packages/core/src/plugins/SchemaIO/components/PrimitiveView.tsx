import React from "react";
import LabelValueView from "./LabelValueView";
import CheckboxView from "./CheckboxView";
import FieldView from "./FieldView";

export default function PrimitiveView(props) {
  const { view: { readOnly } = {}, type } = props.schema;
  const Component = readOnly
    ? LabelValueView
    : type === "boolean"
    ? CheckboxView
    : FieldView;
  return <Component {...props} />;
}
