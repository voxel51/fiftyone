import React from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { useCurrentOverlayId } from "../redux/hooks";

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
  const overlayId = useCurrentOverlayId();
  if (!overlayId) {
    return null;
  }

  return (
    <>
      <div>
        <SchemaIOComponent schema={createSchema()} data={{ id: overlayId }} />
      </div>
    </>
  );
};

export default Id;
