import {
  FRAMES_PREFIX,
  stripReservedLabelAttributes,
  toFrameEnginePath,
  useActiveAnnotationSampleId,
  useAnnotationEngine,
} from "@fiftyone/annotation";
import { usePushUndoable } from "@fiftyone/commands";
import { expandPath, field } from "@fiftyone/state";
import type { LabelData } from "@fiftyone/utilities";
import { FLOAT_FIELD, INT_FIELD } from "@fiftyone/utilities";
import { useAtom } from "jotai";
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
import { current } from "./useAnnotationContext/selectors";

const useSchema = (readOnly: boolean) => {
  const { selected } = useAnnotationContext();
  const config = selected?.schema ?? null;
  const data = selected?.data;
  const isLabelReadOnly = config?.read_only;
  const effectiveReadOnly = readOnly || isLabelReadOnly;

  const allAttributes = useMemo(
    () => (Array.isArray(config?.attributes) ? config.attributes : []),
    [config]
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

  // Stable string key — only changes when the visible attribute set changes
  const visibleKey = [...visibleAttributes.keys()].join("\0");

  // Reruns only when the visible attribute set changes.
  return useMemo(() => {
    const taxonomy = config?.applied_taxonomy as string | undefined;
    // An empty class list would emit a 0-item JSON-Schema enum, which RJSF
    // rejects. Fall back to a free-form text input until the dataset has a
    // configured class list; taxonomy-backed fields always use a dropdown.
    const hasClasses = (config?.classes?.length ?? 0) > 0;
    const properties: Record<string, SchemaType | undefined> = {
      label: generatePrimitiveSchema("label", {
        type: "str",
        component: taxonomy
          ? "dropdown"
          : hasClasses
          ? (config?.component as ComponentType) || "dropdown"
          : undefined,
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
    []
  );
};

/**
 * Handles form changes: parses field types, clears values for attributes
 * whose visible entry changed, and commits the edit to the engine — the
 * read-half reconciles the overlay and the list row; no events. The undo
 * inverse (previous value + explicit nulls for keys this edit introduced)
 * goes on the shared command stack, so Ctrl-Z ordering with geometry edits
 * is preserved.
 *
 * Volatile atoms (config, data, overlay, field) are read via refs so that
 * the returned callback keeps a stable identity across data changes.
 */
const useHandleSchemaChange = (readOnly: boolean) => {
  const { selected } = useAnnotationContext();
  const config = selected?.schema ?? null;
  const data = selected?.data;
  const overlay = selected?.overlay;
  const field = selected?.field ?? null;
  const editingRef = selected?.ref ?? null;
  const engine = useAnnotationEngine();
  const sample = useActiveAnnotationSampleId();
  const { createPushAndExec } = usePushUndoable();
  const parseFieldValue = useParseFieldValue();
  const [currentLabel, setCurrentLabel] = useAtom(current);

  const configRef = useRef(config);
  const dataRef = useRef(data);
  const overlayRef = useRef(overlay);
  const fieldRef = useRef(field);
  const editingRefRef = useRef(editingRef);
  const currentLabelRef = useRef(currentLabel);
  const sampleRef = useRef(sample);
  configRef.current = config;
  dataRef.current = data;
  overlayRef.current = overlay;
  fieldRef.current = field;
  editingRefRef.current = editingRef;
  currentLabelRef.current = currentLabel;
  sampleRef.current = sample;

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
          ])
        )
      );

      // Merge onto the live overlay label, which can be fresher than the
      // form's `data` snapshot. Discard fields which are owned elsewhere.
      const { support: _formSupport, ...formResult } = result as Record<
        string,
        unknown
      >;
      const value = {
        ...(overlay.label as Record<string, unknown>),
        ...formResult,
      };

      const allAttributes = Array.isArray(config?.attributes)
        ? config.attributes
        : [];

      const uniqueConditionalNames = new Set(
        allAttributes.filter((a) => a.when).map((a) => a.name)
      );

      // Iterate over the unique conditional attribute names, obtain the current and
      // previous owner of the data attribute value, and conditionally delete the
      // value if the owner has changed or the attribute has become hidden entirely.
      for (const name of uniqueConditionalNames) {
        if (!name) continue;

        const prevOwner = resolveVisibleAttribute(
          name,
          allAttributes,
          (data ?? {}) as Record<string, unknown>
        );
        const currentOwner = resolveVisibleAttribute(
          name,
          allAttributes,
          value
        );

        if (!currentOwner || prevOwner !== currentOwner) {
          // null, not `delete`: the auto-save delta must carry an explicit
          // unset, otherwise the existing-detection merge resurrects the value.
          value[name] = null;
        }
      }

      if (isEqual(value, data)) return;

      // address the engine in its own namespace: the anchor ref carries the
      // track `instanceId` and the present `frame` for a video frame label, and
      // names the field by its full `frames.<field>` path. Use the LIVE field
      // for the path name (a mid-edit field move tracks through `field`), but
      // re-prefix it when the ref says this is a frame field. With no ref
      // (externally-managed atoms) fall back to the field + doc id, already
      // correct for the sample-level labels those carry.
      const editingRef = editingRefRef.current;
      const isFrameField = editingRef?.path?.startsWith(FRAMES_PREFIX) ?? false;
      const ref = {
        sample: sampleRef.current,
        path: isFrameField ? toFrameEnginePath(field) : field,
        instanceId:
          editingRef?.instanceId ??
          (data as { _id?: string })?._id ??
          overlay.id,
        frame: editingRef?.frame,
      };
      const previous = engine.getLabel(ref) ?? (data as LabelData);

      // explicit nulls for keys this edit introduced — the merge mutator
      // would otherwise resurrect them on undo
      const inverse: Record<string, unknown> = { ...previous };
      for (const key of Object.keys(value)) {
        if (!(key in inverse)) {
          inverse[key] = null;
        }
      }

      // Persist only true label data: a 3D draft's slot carries the working/
      // overlay shape (type/isNew/color/path/sampleId), and committing those
      // pollutes Sample — the write-half's `build3dLabel` strips the same set,
      // so the idempotent guard would never match and the sync loops forever.
      const persistableValue = stripReservedLabelAttributes(
        value as Record<string, unknown>
      );
      const persistableInverse = stripReservedLabelAttributes(inverse);

      createPushAndExec(
        `update-label-${ref.instanceId}-${Date.now()}`,
        () => engine.updateLabel(ref, persistableValue as Partial<LabelData>),
        () => engine.updateLabel(ref, persistableInverse as Partial<LabelData>)
      );

      // the anchor binding rewrites `editing` only for committed labels —
      // a DRAFT's slot is surface-owned, so the form keeps it in sync
      // itself (last-used-class tracking and exit policy read it)
      const live = currentLabelRef.current;

      if (live?.isNew) {
        setCurrentLabel({
          ...live,
          data: value as typeof live.data,
        } as NonNullable<typeof live>);
      }
    },
    [createPushAndExec, engine, parseFieldValue, readOnly, setCurrentLabel]
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
