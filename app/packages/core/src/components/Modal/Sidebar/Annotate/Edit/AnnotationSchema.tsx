import {
  LIGHTER_EVENTS,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import { expandPath, field } from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { useRecoilCallback } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { coerceStringBooleans } from "../utils";
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

        if (typeof data === "string") {
          if (schema?.ftype === FLOAT_FIELD) {
            return data.length ? Number.parseFloat(data) : null;
          }

          if (schema?.ftype === INT_FIELD) {
            return data.length ? Number.parseInt(data) : null;
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
  const lighter = useLighter();
  const handleChanges = useHandleChanges();
  const field = useAtomValue(currentField);

  useEffect(() => {
    const handler = (event) => {
      // Here, this would be true for `undo` or `redo`
      if (event.detail?.command?.constructor?.name !== "UpdateLabelCommand") {
        const label = overlay?.label;

        if (label) {
          save(label);
        }

        return;
      }

      const newLabel = coerceStringBooleans(event.detail.command.nextLabel);

      if (newLabel) {
        save(newLabel);
      }
    };

    lighter.scene?.on(LIGHTER_EVENTS.COMMAND_EXECUTED, handler);
    lighter.scene?.on(LIGHTER_EVENTS.REDO, handler);
    lighter.scene?.on(LIGHTER_EVENTS.UNDO, handler);

    return () => {
      lighter.scene?.off(LIGHTER_EVENTS.COMMAND_EXECUTED, handler);
      lighter.scene?.off(LIGHTER_EVENTS.REDO, handler);
      lighter.scene?.off(LIGHTER_EVENTS.UNDO, handler);
    };
  }, [lighter.scene, overlay, save]);

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
          const result = {};
          for (const key in changes) {
            result[key] = await handleChanges(field, key, changes[key]);
          }
          const value = { ...data, ...result };

          lighter.scene?.executeCommand(
            new UpdateLabelCommand(overlay, overlay.label, value)
          );
        }}
      />
    </div>
  );
};

export default AnnotationSchema;
