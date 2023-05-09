import React from "react";
import TextFieldView from "./TextFieldView";

export default function FieldView(props) {
  const { type } = props.schema;
  const typeToFieldViewComponent = {
    string: TextFieldView,
    number: TextFieldView,
  };

  const FieldComponent = typeToFieldViewComponent[type];

  return <FieldComponent {...props} />;
}
