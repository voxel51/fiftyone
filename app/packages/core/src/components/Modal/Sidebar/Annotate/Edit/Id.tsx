import React from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { useAnnotationContext } from "./useAnnotationContext";

const createId = () => {
  return {
    type: "string",
    view: {
      name: "PrimitiveView",
      readOnly: true,
      component: "PrimitiveView",
    },
  };
};

const createSchema = () => ({
  type: "object",
  view: {
    component: "ObjectView",
  },
  properties: {
    id: createId(),
  },
});

const Id = () => {
  const overlay = useAnnotationContext().selected?.overlay;
  if (!overlay) {
    return null;
  }

  return (
    <>
      <div>
        <SchemaIOComponent schema={createSchema()} data={{ id: overlay?.id }} />
      </div>
    </>
  );
};

export default Id;
