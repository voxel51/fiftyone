import { useAtomValue } from "jotai";
import React from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { currentOverlay } from "./state";

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
  const overlay = useAtomValue(currentOverlay);
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
