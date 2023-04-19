import React, { useEffect } from "react";
import { getComponent } from "../utils";

export default function DynamicIO(props) {
  const { schema, onChange, path, data, errors } = props;
  const Component = getComponent(schema);

  // todo: need to improve initializing default value in state
  useEffect(() => {
    if (schema.default) onChange(path, schema.default);
  }, []);

  return (
    <Component
      schema={schema}
      onChange={onChange}
      path={path}
      data={data}
      errors={errors}
    />
  );
}
