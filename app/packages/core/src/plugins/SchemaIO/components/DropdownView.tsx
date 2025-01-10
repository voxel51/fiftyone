import React from "react";
import AutocompleteView from "./AutocompleteView";

export default function DropdownView(props: ViewPropsType) {
  const { onChange, schema, path, data } = props;
  const { view = {}, type } = schema;
  return (
    <AutocompleteView
      {...props}
      schema={{
        ...schema,
        view: {
          ...view,
          value_only: true,
          allow_user_input: false,
          allow_duplicates: false,
        },
      }}
    />
  );
}
