import {
  LIGHTER_EVENTS,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import { expandPath, field } from "@fiftyone/state";
import { FLOAT_FIELD, INT_FIELD } from "@fiftyone/utilities";
import { useAtom, useAtomValue } from "jotai";
import React, { useEffect, useMemo } from "react";
import { useRecoilCallback } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import {
  currentData,
  currentField,
  currentOverlay,
  currentSchema,
} from "./state";

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

const createRadio = (name: string, choices) => {
  return {
    type: "string",
    view: {
      name: "RadioView",
      label: name,
      component: "RadioView",
      choices: choices.map((choice) => ({
        name: "Choice",
        label: choice,
        value: choice,
      })),
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
      if (attr === "id") {
        continue;
      }

      if (attributes[attr].type === "input") {
        properties[attr] = createInput(attr);
      }

      if (attributes[attr].type === "radio") {
        properties[attr] = createRadio(attr, attributes[attr].values);
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

const useHandleChanges = () => {
  return useRecoilCallback(
    ({ snapshot }) =>
      async (currentField: string, path: string, data) => {
        const expanded = await snapshot.getPromise(expandPath(currentField));
        const schema = await snapshot.getPromise(field(`${expanded}.${path}`));

        if (schema?.ftype === FLOAT_FIELD) {
          return Number.parseFloat(data);
        }

        if (schema?.ftype === INT_FIELD) {
          return Number.parseInt(data);
        }

        return data;
      },
    []
  );
};

const AnnotationSchema = () => {
  const schema = useSchema();
  const [data, save] = useAtom(currentData);
  const overlay = useAtomValue(currentOverlay);
  const lighter = useLighter();
  const handleChanges = useHandleChanges();
  const field = useAtomValue(currentField);

  useEffect(() => {
    const handler = () => {
      save(overlay.getLabel());
    };

    lighter.scene?.on(LIGHTER_EVENTS.COMMAND_EXECUTED, handler);
    return () => {
      lighter.scene?.off(LIGHTER_EVENTS.COMMAND_EXECUTED, handler);
    };
  }, [lighter.scene, overlay, save]);

  if (!field) {
    throw new Error("no overlay");
  }

  if (!overlay) {
    throw new Error("no overlay");
  }

  return (
    <div>
      <SchemaIOComponent
        schema={schema}
        data={data}
        onChange={async (changes) => {
          const result = {};
          for (const key in changes) {
            result[key] = await handleChanges(field, key, changes[key]);
          }
          const value = { ...data, ...result };

          lighter.scene?.executeCommand(
            new UpdateLabelCommand(overlay, overlay.getLabel(), value)
          );
        }}
      />
    </div>
  );
};

export default AnnotationSchema;
