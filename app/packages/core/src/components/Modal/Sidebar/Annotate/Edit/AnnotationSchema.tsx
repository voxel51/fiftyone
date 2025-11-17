import { useAnnotationEventBus } from "@fiftyone/annotation";
import { expandPath, field } from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import { useAtom, useAtomValue } from "jotai";
import { isEqual } from "lodash";
import React, { useMemo } from "react";
import { useRecoilCallback } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import {
  currentData,
  currentField,
  currentOverlay,
  currentSchema,
} from "./state";

const getLabel = (value) => {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  if (value === null || value === undefined) {
    return "None";
  }

  return value;
};

const createInput = (name: string, ftype: string) => {
  return {
    type:
      ftype === STRING_FIELD
        ? "string"
        : ftype === BOOLEAN_FIELD
        ? "boolean"
        : "number",
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
      name: "RadioGroup",
      label: name,
      component: "RadioView",
      choices: choices.map((choice) => ({
        label: getLabel(choice),
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
        label: getLabel(choice),
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
        label: getLabel(choice),
        value: choice,
      })),
    },
  };
};

const useSchema = () => {
  const config = useAtomValue(currentSchema);

  return useMemo(() => {
    const properties: Record<string, any> = {};

    const attributes = config?.attributes;
    properties.label = createSelect("label", config?.classes ?? []);

    for (const attr in attributes) {
      if (attr === "id") {
        continue;
      }

      if (attributes[attr].type === "input") {
        properties[attr] = createInput(
          attr,
          attributes[attr].ftype || STRING_FIELD
        );
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

        if (typeof data === "string") {
          if (schema?.ftype === FLOAT_FIELD) {
            if (!data.length) return null;
            const parsed = Number.parseFloat(data);
            return Number.isNaN(parsed) ? null : parsed;
          }

          if (schema?.ftype === INT_FIELD) {
            if (!data.length) return null;
            const parsed = Number.parseInt(data);
            return Number.isNaN(parsed) ? null : parsed;
          }
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
  const eventBus = useAnnotationEventBus();
  const handleChanges = useHandleChanges();
  const field = useAtomValue(currentField);

  const schemaKeys = Object.keys(schema.properties);

  if (!field) {
    throw new Error("no field");
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
          const result = Object.fromEntries(
            await Promise.all(
              Object.entries(changes)
                .filter(([key]) => schemaKeys.includes(key))
                .map(async ([key, value]) => [
                  key,
                  await handleChanges(field, key, value),
                ])
            )
          );

          const value = { ...data, ...result };

          if (isEqual(value, overlay.label)) {
            return;
          }

          eventBus.dispatch("annotation:notification:sidebarValueUpdated", {
            overlayId: overlay.id,
            currentLabel: overlay.label as any,
            value,
          });
        }}
      />
    </div>
  );
};

export default AnnotationSchema;
