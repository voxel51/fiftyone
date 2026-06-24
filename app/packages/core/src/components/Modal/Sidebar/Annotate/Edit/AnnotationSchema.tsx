import { useAnnotationEventBus } from "@fiftyone/annotation";
import { expandPath, field } from "@fiftyone/state";
import { FLOAT_FIELD, INT_FIELD } from "@fiftyone/utilities";
import { isEqual } from "lodash";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilCallback } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import type { AttributeConfig } from "../SchemaManager/utils";
import type { ComponentType, FieldType } from "../useSchemaManager";
import {
  evaluateWhen,
  isWhenFulfillable,
  resolveVisibleAttribute,
} from "./evaluateWhen";
import { generatePrimitiveSchema } from "./schemaHelpers";
import { useAnnotationContext } from "./useAnnotationContext";

const useSchema = (readOnly: boolean) => {
  const { selected } = useAnnotationContext();
  const config = selected?.schema ?? null;
  const data = selected?.data;
  const isLabelReadOnly = config?.read_only;
  const effectiveReadOnly = readOnly || isLabelReadOnly;

  const allAttributes = useMemo(
    () => (Array.isArray(config?.attributes) ? config.attributes : []),
    [config],
  );

  const visibleAttributes = useMemo(() => {
    return allAttributes.reduce((map, attr) => {
      if (!attr.name || attr.name === "id" || attr.name === "attributes")
        return map;
      if (map.has(attr.name)) return map;
      if (
        evaluateWhen(attr.when, (data ?? {}) as Record<string, unknown>) ||
        !isWhenFulfillable(attr.when, allAttributes)
      ) {
        map.set(attr.name, attr);
      }
      return map;
    }, new Map<string, AttributeConfig>());
  }, [allAttributes, data]);

  // Key on the winning entry's index, not its name: same-name variants must
  // bust the schema memo when the active one swaps (Toyota model -> Honda).
  const visibleKey = [...visibleAttributes.values()]
    .map((attr) => allAttributes.indexOf(attr))
    .join("\0");

  // Reruns only when the visible attribute set changes.
  return useMemo(() => {
    const taxonomy = config?.applied_taxonomy;
    const properties: Record<string, SchemaType | undefined> = {
      label: generatePrimitiveSchema("label", {
        type: "str",
        component: taxonomy ? "dropdown" : config?.component || "dropdown",
        values: taxonomy ? [] : config?.classes || [],
        taxonomy,
        readOnly: effectiveReadOnly,
      }),
    };

    for (const [name, attr] of visibleAttributes) {
      properties[name] = generatePrimitiveSchema(name, {
        ...attr,
        type: attr.type as FieldType,
        component: attr.component as ComponentType | undefined,
        values: attr.values as string[] | number[] | undefined,
        taxonomy: attr.taxonomy,
        readOnly: effectiveReadOnly || attr.read_only,
      });
    }

    return {
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties,
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, config, effectiveReadOnly]);
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
    [],
  );
};

/**
 * Handles form changes: parses field types, clears values for attributes
 * whose visible entry changed, and dispatches the update event.
 *
 * Volatile atoms (config, data, overlay, field) are read via refs so that
 * the returned callback keeps a stable identity across data changes.
 */
const useHandleSchemaChange = (readOnly: boolean) => {
  const { selected } = useAnnotationContext();
  const config = selected?.schema ?? null;
  const data = selected?.data;
  const overlay = selected?.overlay;
  const eventBus = useAnnotationEventBus();
  const parseFieldValue = useParseFieldValue();
  const field = selected?.field ?? null;

  const configRef = useRef(config);
  const dataRef = useRef(data);
  const overlayRef = useRef(overlay);
  const fieldRef = useRef(field);
  configRef.current = config;
  dataRef.current = data;
  overlayRef.current = overlay;
  fieldRef.current = field;

  return useCallback(
    async (changes: Record<string, unknown>) => {
      const config = configRef.current;
      const data = dataRef.current;
      const overlay = overlayRef.current;
      const field = fieldRef.current;

      if (readOnly || !field || !overlay) return;

      const result = Object.fromEntries(
        await Promise.all(
          Object.entries(changes).map(async ([key, value]) => [
            key,
            await parseFieldValue(field, key, value),
          ]),
        ),
      );

      const value = { ...data, ...result };

      const allAttributes = Array.isArray(config?.attributes)
        ? config.attributes
        : [];

      const uniqueConditionalNames = new Set(
        allAttributes.filter((a) => a.when).map((a) => a.name),
      );

      // Iterate over the unique conditional attribute names, obtain the current and
      // previous owner of the data attribute value, and conditionally delete the
      // value if the owner has changed or the attribute has become hidden entirely.
      for (const name of uniqueConditionalNames) {
        if (!name) continue;

        const prevOwner = resolveVisibleAttribute(
          name,
          allAttributes,
          (data ?? {}) as Record<string, unknown>,
        );
        const currentOwner = resolveVisibleAttribute(
          name,
          allAttributes,
          value,
        );

        if (!currentOwner || prevOwner !== currentOwner) {
          // null, not `delete`: the auto-save delta must carry an explicit
          // unset, otherwise the existing-detection merge resurrects the value.
          value[name] = null;
        }
      }

      if (isEqual(value, overlay.label)) return;

      eventBus.dispatch("annotation:sidebarValueUpdated", {
        overlayId: overlay.id,
        currentLabel: overlay.label as any,
        value,
      });
    },
    [eventBus, parseFieldValue, readOnly],
  );
};

export interface AnnotationSchemaProps {
  readOnly?: boolean;
}

const AnnotationSchema = ({ readOnly = false }: AnnotationSchemaProps) => {
  const schema = useSchema(readOnly);
  const { selected } = useAnnotationContext();
  const data = selected?.data;
  const overlay = selected?.overlay;
  const field = selected?.field ?? null;
  const onChange = useHandleSchemaChange(readOnly);

  if (!field) throw new Error("no field");
  if (!overlay) throw new Error("no overlay");

  const displayData = useMemo(() => {
    if (!readOnly) return data;
    return Object.fromEntries(
      Object.entries(data || {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(", ") : value,
      ]),
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
