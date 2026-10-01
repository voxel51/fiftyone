/**
 * Named label-schema DOC access for the Schema Manager (the converged
 * design's one-editing-surface). Wraps the `@voxel51/label-schemas`
 * schema-doc operators with the same `operatorAsPromise` pattern the
 * dataset-level schema manager uses, and holds the manager's doc-mode
 * state: which doc is selected (null = classic dataset mode) and its
 * loaded body.
 *
 * The stage config picker only SELECTS docs; all editing — visibility
 * tiers and content — happens here in the Schema Manager.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useAtom, useSetAtom, type PrimitiveAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import {
  managerSchemaDoc,
  managerSchemaDocId,
  taskLabelSchemaDoc,
} from "../state";
import { operatorAsPromise, type Operator } from "../useSchemaManager";
import type {
  DocResponse,
  ListResponse,
  OkResponse,
  ResolvedSchemaDoc,
  SchemaDoc,
  SchemaDocContentEntry,
  SchemaDocSummary,
} from "./schemaDocTypes";

// The doc shapes and tier helpers live in `schemaDocTypes`; re-exported
// so existing importers keep one entry point.
export * from "./schemaDocTypes";

/** The builtin plugin that owns label-schema documents (workflow-neutral). */
export const LABEL_SCHEMAS_PLUGIN = "@voxel51/label-schemas";
const PLUGIN_PREFIX = LABEL_SCHEMAS_PLUGIN;
/** Gate for "the schema-doc operators are registered" checks. */
export const LIST_LABEL_SCHEMA_DOCS_OPERATOR = `${PLUGIN_PREFIX}/list_label_schema_docs`;

/**
 * Selected schema doc id; null = classic dataset-schema mode. Aliases
 * the canonical atoms in `Annotate/state.ts` — while a doc is open,
 * `effectiveLabelSchemasData` overlays its content so the whole
 * existing editing surface reads THIS schema.
 */
export const selectedSchemaDocId = managerSchemaDocId;

/** The selected doc's loaded body (kept fresh by `SchemaDocPanel`). */
export const loadedSchemaDoc =
  managerSchemaDoc as unknown as PrimitiveAtom<SchemaDoc | null>;

const fail = (res: OkResponse | undefined, verb: string): never => {
  throw new Error(res?.error ?? `Failed to ${verb} schema`);
};

export interface SchemaDocsApi {
  listDocs(): Promise<SchemaDocSummary[]>;
  getDoc(
    schemaId: string,
    includeResolved?: boolean,
  ): Promise<SchemaDoc & { resolved?: ResolvedSchemaDoc }>;
  createDoc(name: string, fromDataset: boolean): Promise<SchemaDoc>;
  /**
   * Partial update. Pass the loaded doc's `version` to make the save
   * conditional: the operator refuses to overwrite a newer version (a
   * second tab or user saved first) and the promise rejects.
   */
  updateDoc(
    schemaId: string,
    updates: Partial<
      Pick<SchemaDoc, "name" | "description" | "label_schema" | "visibility">
    > & { version?: number },
  ): Promise<SchemaDoc>;
  deleteDoc(schemaId: string): Promise<void>;
  /**
   * Fans a newly created dataset field out to every custom schema:
   * annotate-tier `entry` in `sourceSchemaId` (when given), explicit
   * hidden everywhere else. The dataset default is written by the
   * field creation itself.
   */
  propagateField(
    path: string,
    entry: SchemaDocContentEntry | null,
    sourceSchemaId: string | null,
  ): Promise<void>;
}

export const useSchemaDocs = (): SchemaDocsApi => {
  // ``useOperatorExecutor`` returns a new object identity per render;
  // capture the executors in a ref so the returned api is REFERENTIALLY
  // STABLE — effects keyed on it must not re-fire per render (that bug
  // reset the field-editor navigation on every click and refetched the
  // doc in a loop).
  const operatorsRef = useRef<{
    list: Operator<Record<string, never>, ListResponse>;
    get: Operator<
      { schema_id: string; include_resolved?: boolean },
      DocResponse
    >;
    create: Operator<{ name: string; from_dataset: boolean }, DocResponse>;
    update: Operator<
      { schema_id: string } & Record<string, unknown>,
      DocResponse
    >;
    del: Operator<{ schema_id: string }, OkResponse>;
    propagate: Operator<
      { path: string; entry?: unknown; source_schema_id?: string },
      OkResponse
    >;
  }>();
  operatorsRef.current = {
    list: useOperatorExecutor(
      `${PLUGIN_PREFIX}/list_label_schema_docs`,
    ) as Operator<Record<string, never>, ListResponse>,
    get: useOperatorExecutor(
      `${PLUGIN_PREFIX}/get_label_schema_doc`,
    ) as Operator<
      { schema_id: string; include_resolved?: boolean },
      DocResponse
    >,
    create: useOperatorExecutor(
      `${PLUGIN_PREFIX}/create_label_schema_doc`,
    ) as Operator<{ name: string; from_dataset: boolean }, DocResponse>,
    update: useOperatorExecutor(
      `${PLUGIN_PREFIX}/update_label_schema_doc`,
    ) as Operator<{ schema_id: string } & Record<string, unknown>, DocResponse>,
    del: useOperatorExecutor(
      `${PLUGIN_PREFIX}/delete_label_schema_doc`,
    ) as Operator<{ schema_id: string }, OkResponse>,
    propagate: useOperatorExecutor(
      `${PLUGIN_PREFIX}/propagate_label_schema_field`,
    ) as Operator<
      { path: string; entry?: unknown; source_schema_id?: string },
      OkResponse
    >,
  };

  const listDocs = useCallback(async () => {
    const res = await operatorAsPromise(operatorsRef.current!.list, {});
    if (!res?.ok) fail(res, "list");
    return res.schemas ?? [];
  }, []);

  const getDoc = useCallback(
    async (schemaId: string, includeResolved = false) => {
      const res = await operatorAsPromise(operatorsRef.current!.get, {
        schema_id: schemaId,
        include_resolved: includeResolved,
      });
      if (!res?.ok || !res.schema) fail(res, "load");
      const vis = res.schema!.visibility;
      return {
        ...res.schema!,
        label_schema: res.schema!.label_schema ?? {},
        visibility: { ...vis, fields: vis?.fields ?? {} },
        resolved: res.resolved,
      };
    },
    [],
  );

  const createDoc = useCallback(async (name: string, fromDataset: boolean) => {
    const res = await operatorAsPromise(operatorsRef.current!.create, {
      name,
      from_dataset: fromDataset,
    });
    if (!res?.ok || !res.schema) fail(res, "create");
    return res.schema!;
  }, []);

  const updateDoc = useCallback(
    async (
      schemaId: string,
      updates: Partial<
        Pick<SchemaDoc, "name" | "description" | "label_schema" | "visibility">
      >,
    ) => {
      const res = await operatorAsPromise(operatorsRef.current!.update, {
        schema_id: schemaId,
        ...updates,
      });
      if (!res?.ok || !res.schema) fail(res, "update");
      return res.schema!;
    },
    [],
  );

  const deleteDoc = useCallback(async (schemaId: string) => {
    const res = await operatorAsPromise(operatorsRef.current!.del, {
      schema_id: schemaId,
    });
    if (!res?.ok) fail(res, "delete");
  }, []);

  const propagateField = useCallback(
    async (
      path: string,
      entry: SchemaDocContentEntry | null,
      sourceSchemaId: string | null,
    ) => {
      const res = await operatorAsPromise(operatorsRef.current!.propagate, {
        path,
        entry: entry ?? undefined,
        source_schema_id: sourceSchemaId ?? undefined,
      });
      if (!res?.ok) fail(res, "propagate field to");
    },
    [],
  );

  return useMemo(
    () => ({
      listDocs,
      getDoc,
      createDoc,
      updateDoc,
      deleteDoc,
      propagateField,
    }),
    [listDocs, getDoc, createDoc, updateDoc, deleteDoc, propagateField],
  );
};

/**
 * The Schema Manager's doc-editing mode, or null in classic dataset
 * mode. `useLabelSchema` branches on this so the SAME rich editor
 * (classes/attribute forms, ontology, JSON, scan) authors named-schema
 * content: reads come through the envelope overlay, saves go to the
 * doc via the operators.
 */
export const useManagerDocMode = () => {
  const [docId] = useAtom(selectedSchemaDocId);
  const [doc, setDoc] = useAtom(loadedSchemaDoc);
  const api = useSchemaDocs();
  // The two atoms are written independently; a doc restored by an
  // async write-back after the selection moved on must not be paired
  // with the new id (a later save would write it to the wrong schema).
  if (!docId || !doc || doc.id !== docId) return null;
  return { docId, doc, setDoc, api };
};

/**
 * Preselects the schema currently IN USE when the Schema Manager
 * opens: the active workflow task's schema, else the admin Explore
 * lens; otherwise the dataset default (classic mode). One-shot on
 * mount — the close cleanup nulls the selection, so each open
 * re-derives it, while switching schemas during a session sticks.
 */
export const useOpenOnCurrentSchema = () => {
  const [taskDoc] = useAtom(taskLabelSchemaDoc);
  const lens = useRecoilValue(fos.schemaLens);
  const datasetName = useRecoilValue(fos.datasetName);
  const [selected, setSelected] = useAtom(selectedSchemaDocId);

  // "All fields" / default means classic dataset mode.
  const explicit =
    lens && lens.dataset === datasetName && lens.docId !== "__all__"
      ? lens.docId
      : null;
  const currentId = (taskDoc as { id?: string } | null)?.id ?? explicit;

  const initialRef = useRef<{
    selected: string | null;
    currentId: string | null;
  }>();
  if (!initialRef.current) {
    initialRef.current = { selected, currentId };
  }

  useEffect(() => {
    const initial = initialRef.current!;
    if (!initial.selected && initial.currentId) {
      setSelected(initial.currentId);
    }
    // Mount-only by construction: reads the snapshot taken on first
    // render, so later context changes never override the user.
  }, [setSelected]);
};

/** Convenience: clear doc-mode state (used on modal close). */
export const useResetSchemaDocMode = () => {
  const setSelected = useSetAtom(selectedSchemaDocId);
  const setLoaded = useSetAtom(loadedSchemaDoc);
  return useCallback(() => {
    setSelected(null);
    setLoaded(null);
  }, [setSelected, setLoaded]);
};

/** Read/write the selected doc id. */
export const useSelectedSchemaDocId = () => useAtom(selectedSchemaDocId);
