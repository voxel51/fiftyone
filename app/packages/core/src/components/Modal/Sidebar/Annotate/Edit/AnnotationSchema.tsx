import {
  BoundingBoxOverlay,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import { useAtom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { currentData, currentSchema } from "./state";

const createInput = (name: string) => {
  return {
    type: "string",
    view: {
      name: "PrimitiveView",
      label: name,
      component: "PrimitiveView",
    },
  };
};

const createTags = (name: string, choices: string[]) => {
  return {
    type: "array",
    view: {
      name: "AutocompleteView",
      label: name,
      component: "AutocompleteView",
      allow_user_input: false,
      choices: choices.map((choice) => ({
        name: "Choice",
        label: choice,
        value: choice,
      })),
    },
    required: true,
  };
};

const createSelect = (name: string, choices: string[]) => {
  return {
    type: "string",
    view: {
      name: "DropdownView",
      label: name,
      component: "DropdownView",
      choices: choices.map((choice) => ({
        name: "Choice",
        label: choice,
        value: choice,
      })),
    },
  };
};

const useSchema = () => {
  const config = useAtomValue(currentSchema);

  return useMemo(() => {
    const properties = {};

    const attributes = config?.attributes;

    properties.label = createSelect("label", config?.classes ?? []);

    for (const attr in attributes) {
      if (attributes[attr].type === "input") {
        properties[attr] = createInput(attr);
      }

      if (attributes[attr].type === "tags") {
        properties[attr] = createTags(attr, attributes[attr].values);
      }

      if (attributes[attr].type === "text") {
        throw "text";
      }
    }

    return {
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties,
    };
  }, [config]);
};

const AnnotationSchema = () => {
  const schema = useSchema();
  const [data, save] = useAtom(currentData);
  const lighter = useLighter();

  return (
    <div>
      <SchemaIOComponent
        schema={schema}
        data={data}
        onChange={(changes) => {
          save(changes);
          const overlay = lighter.getOverlay(data?._id);

          if (overlay instanceof BoundingBoxOverlay) {
            lighter.scene?.executeCommand(
              new UpdateLabelCommand(overlay, overlay.label, {
                ...overlay.label,
                ...changes,
              })
            );
          }
        }}
      />
    </div>
  );
};

export default AnnotationSchema;
