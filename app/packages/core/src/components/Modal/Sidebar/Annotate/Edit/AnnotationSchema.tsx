import { useAnnotationEventBus } from "@fiftyone/annotation";
import { expandPath, field } from "@fiftyone/state";
import { FLOAT_FIELD, INT_FIELD } from "@fiftyone/utilities";
import { useAtom, useAtomValue } from "jotai";
import { isEqual } from "lodash";
import { useCallback, useMemo } from "react";
import { useRecoilCallback } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import {
  evaluateWhen,
  isWhenFulfillable,
  resolveVisibleAttribute,
} from "./evaluateWhen";
import { generatePrimitiveSchema } from "./schemaHelpers";
import {
  currentData,
  currentField,
  currentOverlay,
  currentSchema,
} from "./state";

const useSchema = (readOnly: boolean) => {
  const config = useAtomValue(currentSchema);
  const data = useAtomValue(currentData);
  const isLabelReadOnly = config?.read_only;
  const effectiveReadOnly = readOnly || isLabelReadOnly;

  return useMemo(() => {
    const attributes = Array.isArray(config?.attributes)
      ? config.attributes
      : [];

    const seen = new Set<string>();

    const properties = attributes
      .filter(({ name }) => name && !["id", "attributes"].includes(name))
      .filter(
        (attr) =>
          evaluateWhen(attr.when, data ?? {}) ||
          !isWhenFulfillable(attr.when, attributes)
      )
      .filter((attr) => {
        if (seen.has(attr.name)) return false;
        seen.add(attr.name);
        return true;
      })
      .reduce(
        (schema: SchemaType, value: SchemaType) => ({
          ...schema,
          [value.name!]: generatePrimitiveSchema(value.name!, {
            ...value,
            readOnly: effectiveReadOnly || value.read_only,
          }),
        }),
        {
          label: generatePrimitiveSchema("label", {
            type: "str",
            component: config?.component || "dropdown",
            values: config?.classes || [],
            readOnly: effectiveReadOnly,
          }),
        }
      );

    return {
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties,
    };
  }, [config, data, effectiveReadOnly]);
};

const useParseFieldValue = () => {
  return useRecoilCallback(
    ({ snapshot }) =>
      async (currentField: string, path: string, data) => {
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

/**
 * Handles form changes: parses field types, clears values for attributes
 * whose visible entry changed, and dispatches the update event.
 */
const useHandleSchemaChange = (readOnly: boolean) => {
  const config = useAtomValue(currentSchema);
  const [data] = useAtom(currentData);
  const overlay = useAtomValue(currentOverlay);
  const eventBus = useAnnotationEventBus();
  const parseFieldValue = useParseFieldValue();
  const field = useAtomValue(currentField);

  return useCallback(
    async (changes: Record<string, unknown>) => {
      if (readOnly || !field || !overlay) return;

      const result = Object.fromEntries(
        await Promise.all(
          Object.entries(changes).map(async ([key, value]) => [
            key,
            await parseFieldValue(field, key, value),
          ])
        )
      );

      const value = { ...data, ...result };

      const allAttributes = Array.isArray(config?.attributes)
        ? config.attributes
        : [];

      const uniqueConditionalNames = new Set(
        allAttributes.filter((a) => a.when).map((a) => a.name)
      );

      for (const name of uniqueConditionalNames) {
        if (!name) continue;
        // An unconditional (always-visible) variant for this name exists — its
        // value must never be wiped by conditional-switch logic because
        // resolveVisibleAttribute only inspects `when`-bearing entries and
        // would return undefined, falsely triggering deletion.
        if (allAttributes.some((a) => a.name === name && !a.when)) continue;
        const prevEntry = resolveVisibleAttribute(
          name,
          allAttributes,
          (data ?? {}) as Record<string, unknown>
        );
        const newEntry = resolveVisibleAttribute(name, allAttributes, value);
        if (!newEntry || prevEntry !== newEntry) {
          delete value[name];
        }
      }

      if (isEqual(value, overlay.label)) return;

      eventBus.dispatch("annotation:sidebarValueUpdated", {
        overlayId: overlay.id,
        currentLabel: overlay.label as any,
        value,
      });
    },
    [config, data, eventBus, field, parseFieldValue, overlay, readOnly]
  );
};

export interface AnnotationSchemaProps {
  readOnly?: boolean;
}

const AnnotationSchema = ({ readOnly = false }: AnnotationSchemaProps) => {
  const schema = useSchema(readOnly);
  const [data] = useAtom(currentData);
  const overlay = useAtomValue(currentOverlay);
  const field = useAtomValue(currentField);
  const onChange = useHandleSchemaChange(readOnly);

  if (!field) throw new Error("no field");
  if (!overlay) throw new Error("no overlay");

  const displayData = useMemo(() => {
    if (!readOnly) return data;
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
        smartFormProps={{ liveValidate: "onChange" }}
        schema={schema}
        data={displayData}
        onChange={onChange}
      />
    </div>
  );
};

export default AnnotationSchema;
