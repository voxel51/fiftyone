import { useEffect, useRef, useState } from "react";
import { useAnnotationEventBus } from "@fiftyone/annotation";
import { expandPath, field, type AnnotationLabel } from "@fiftyone/state";
import { FLOAT_FIELD, INT_FIELD } from "@fiftyone/utilities";
import { useAtom, useAtomValue } from "jotai";
import { isEqual } from "lodash";
import { useMemo } from "react";
import { useRecoilCallback } from "recoil";
import { KnownContexts, useCommandContext } from "@fiftyone/commands";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import { generatePrimitiveSchema } from "./schemaHelpers";
import {
  currentData,
  currentField,
  currentOverlay,
  currentSchema,
} from "./state";

const useSchema = (readOnly: boolean) => {
  const config = useAtomValue(currentSchema);
  const isLabelReadOnly = config?.read_only;
  // respect either the field OR the parent schema's readOnly flag
  const effectiveReadOnly = readOnly || isLabelReadOnly;

  return useMemo(() => {
    const attributes = Array.isArray(config?.attributes)
      ? config.attributes
      : [];
    const properties = attributes
      .filter(({ name }) => name && !["id", "attributes"].includes(name))
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
  }, [config, effectiveReadOnly]);
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

  // Track the last pending value to handle rapid onChange events
  // When typing fast, the atom doesn't update in time, so we need to track
  // the pending value ourselves to get the correct "before" state
  const pendingValueRef = useRef<AnnotationLabel["data"] | null>(null);

  // Counter to force re-render only when commands execute (undo/redo)
  // This avoids remounting on every keystroke which would lose focus
  const [renderKey, setRenderKey] = useState(0);
  const { context } = useCommandContext(KnownContexts.ModalAnnotate);

  useEffect(() => {
    // Increment the key to force SchemaIOComponent to re-render on undo/redo
    return context.subscribeActions((_actionId, isUndo, isRedo) => {
      if (isUndo || isRedo) {
        pendingValueRef.current = null;
        setRenderKey((prev) => prev + 1);
      }
    });
  }, [context]);

  const field = useAtomValue(currentField);

  if (!field) {
    throw new Error("no field");
  }

  if (!overlay) {
    throw new Error("no overlay");
  }

  // Transform data for read-only display: convert arrays to comma-separated strings
  const displayData = useMemo(() => {
    const result = !readOnly
      ? data
      : Object.fromEntries(
          Object.entries(data || {}).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(", ") : value,
          ])
        );

    return result;
  }, [data, readOnly]);

  return (
    <div>
      <SchemaIOComponent
        key={renderKey}
        smartForm={true}
        smartFormProps={{
          liveValidate: "onChange",
        }}
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

          // Use the pending value as currentLabel if available, otherwise use data
          // This ensures we capture the correct "before" state during rapid typing
          const currentLabel = (pendingValueRef.current ||
            data) as AnnotationLabel["data"];

          // Update the pending value ref for the next onChange
          // Deep clone to prevent mutation of the stored reference
          pendingValueRef.current = structuredClone(
            value
          ) as AnnotationLabel["data"];

          _save(value);

          eventBus.dispatch("annotation:sidebarValueUpdated", {
            overlayId: overlay.id,
            currentLabel,
            value,
          });
        }}
      />
    </div>
  );
};

export default AnnotationSchema;
