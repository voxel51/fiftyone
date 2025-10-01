import { useAtom, useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { current, currentSchema } from "./state";

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

const createSelect = (name: string, choices: string[]) => {
  return {
    [name]: {
      type: "string",
      view: {
        name: "DropdownView",
        label: "Classes",
        component: "DropdownView",
        choices: choices.map((choice) => ({
          name: "Choice",
          label: choice,
          value: choice,
        })),
      },
    },
  };
};

const useSchema = () => {
  const config = useAtomValue(currentSchema);

  return useMemo(() => {
    const properties = {};

    const attributes = config?.attributes;

    for (const attr in attributes) {
      properties[attr] = createInput(attr);
    }

    console.log(properties);

    return {
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        classes: createSelect("Classes", config?.classes),
        ...properties,
      },
    };
  }, [config]);
};

const AnnotationSchema = () => {
  const schema = useSchema();
  const [label, setLabel] = useAtom(current);
  return (
    <div>
      <SchemaIOComponent
        schema={schema}
        data={{ _classes: label?.data.label }}
        onChange={(...a) => {
          console.log(a);
        }}
      />
    </div>
  );
};

export default AnnotationSchema;
