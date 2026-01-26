import { useAnnotationEventBus } from "@fiftyone/annotation";
import { expandPath, field } from "@fiftyone/state";
import { FLOAT_FIELD, INT_FIELD } from "@fiftyone/utilities";
import { useAtom, useAtomValue } from "jotai";
import { isEqual } from "lodash";
import { useMemo } from "react";
import { useRecoilCallback } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import {
  createInput,
  createRadio,
  createSelect,
  createTags,
} from "./schemaHelpers";
import {
  currentData,
  currentField,
  currentOverlay,
  currentSchema,
} from "./state";

const useSchema = (readOnly: boolean) => {
  const config = useAtomValue(currentSchema);

  return useMemo(() => {
    const properties: Record<string, any> = {};

    const attributes = config?.attributes;
    properties.label = createSelect("label", config?.classes ?? [], readOnly);

    for (const attr in attributes) {
      if (attr === "id") {
        continue;
      }

      if (attributes[attr].component === "text") {
        properties[attr] = createInput(attr, attributes[attr], readOnly);
      }

      if (attributes[attr].component === "radio") {
        properties[attr] = createRadio(attr, attributes[attr].values, readOnly);
      }

      if (attributes[attr].component === "dropdown") {
        properties[attr] = createTags(attr, attributes[attr].values, readOnly);
      }
    }

    return {
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties,
    };
  }, [config, readOnly]);
};

const useHandleChanges = () => {
  return useRecoilCallback(
    ({ snapshot }) => async (currentField: string, path: string, data) => {
      const expanded = await snapshot.getPromise(expandPath(currentField));
      const schema = await snapshot.getPromise(field(`${expanded}.${path}`));

      if (typeof data === "string") {
        if (schema?.ftype === FLOAT_FIELD) {
          if (!data.length) return null;
          const parsed = Number.parseFloat(data);
          return Number.isFinite(parsed) ? parsed : null;
        }

        if (schema?.ftype === INT_FIELD) {
          if (!data.length) return null;
          const parsed = Number.parseInt(data);
          return Number.isFinite(parsed) ? parsed : null;
        }
      }

      return data;
    },
    []
  );
};

export interface AnnotationSchemaProps {
  readOnly?: boolean;
}

const AnnotationSchema = ({ readOnly = false }: AnnotationSchemaProps) => {
  const schema = useSchema(readOnly);
  const [data, _save] = useAtom(currentData);
  const overlay = useAtomValue(currentOverlay);
  const eventBus = useAnnotationEventBus();
  const handleChanges = useHandleChanges();
  const field = useAtomValue(currentField);

  if (!field) {
    throw new Error("no field");
  }

  if (!overlay) {
    throw new Error("no overlay");
  }

  // Transform data for read-only display: convert arrays to comma-separated strings
  const displayData = useMemo(() => {
    if (!readOnly) {
      return data;
    }

    return Object.fromEntries(
      Object.entries(data || {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(", ") : value,
      ])
    );
  }, [data, readOnly]);

  return (
    <div>
      <SchemaIOComponent
        key={overlay.id}
        smartForm={true}
        schema={schema}
        data={displayData}
        onChange={async (changes) => {
          if (readOnly) return;

          const result = Object.fromEntries(
            await Promise.all(
              Object.entries(changes).map(async ([key, value]) => [
                key,
                await handleChanges(field, key, value),
              ])
            )
          );

          const value = { ...data, ...result };

          if (isEqual(value, overlay.label)) {
            return;
          }

          eventBus.dispatch("annotation:sidebarValueUpdated", {
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
