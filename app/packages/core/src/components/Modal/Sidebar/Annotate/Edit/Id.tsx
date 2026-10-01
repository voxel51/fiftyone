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
  const selected = useAnnotationContext().selected;
  const overlay = selected?.overlay;
  if (!overlay) {
    return null;
  }

  // a video frame field's value is addressed by its field; show its document
  const docId = (selected?.data as { _docId?: string } | undefined)?._docId;

  return (
    <>
      <div>
        <SchemaIOComponent
          schema={createSchema()}
          data={{ id: docId || overlay.id }}
        />
      </div>
    </>
  );
};

export default Id;
