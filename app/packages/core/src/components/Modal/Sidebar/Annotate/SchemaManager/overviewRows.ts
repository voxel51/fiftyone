/**
 * Row model for the Schema Manager overview: which fields appear, in
 * which section, with which display metadata. Pure derivation from the
 * dataset schema, the selected doc and the search filter.
 */

import { atom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { fieldAttributeCount, fieldType } from "../state";
import { isSystemReadOnlyField } from "./constants";
import {
  docFieldTier,
  PROTECTED_PATHS,
  type SchemaDoc,
  type SchemaDocTier,
} from "./useSchemaDocs";

export interface RowData {
  path: string;
  tier: SchemaDocTier;
  /** Scanned — has a configured label schema (content). */
  setUp: boolean;
  system: boolean;
  unsupported: boolean;
}

export interface OverviewSections {
  /** Set-up (scanned) fields, in the stored annotate order. */
  scanned: RowData[];
  /** Explore-only fields awaiting setup. */
  unscanned: RowData[];
  /** Protected paths: annotatable via setup, never hideable. */
  unhideable: RowData[];
  /** System / unsupported fields: never annotatable. */
  system: RowData[];
  hidden: RowData[];
}

export const useOverviewRows = ({
  datasetSchemas,
  doc,
  docMode,
  search,
  activeFields,
}: {
  datasetSchemas: Record<string, unknown> | null;
  doc: SchemaDoc | null;
  docMode: boolean;
  search: string;
  activeFields: string[];
}) => {
  const rowPaths = useMemo(() => {
    const paths = new Set<string>(Object.keys(datasetSchemas ?? {}));
    if (docMode && doc) {
      for (const p of Object.keys(doc.label_schema)) paths.add(p);
      for (const p of Object.keys(doc.visibility.fields ?? {})) paths.add(p);
    }
    return [...paths].sort();
  }, [datasetSchemas, doc, docMode]);

  const activeSet = useMemo(() => new Set(activeFields), [activeFields]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const out: RowData[] = [];
    for (const path of rowPaths) {
      if (needle && !path.toLowerCase().includes(needle)) continue;
      const meta = datasetSchemas?.[path] as
        | { label_schema?: unknown; unsupported?: boolean }
        | undefined;
      const system = isSystemReadOnlyField(path);
      const unsupported = Boolean(meta?.unsupported);
      if (docMode && doc) {
        out.push({
          path,
          tier: docFieldTier(doc, path) as SchemaDocTier,
          setUp: path in doc.label_schema,
          system,
          unsupported,
        });
      } else {
        // Dataset default: a scanned field is annotate+explore, an
        // unscanned one explore-only; nothing is ever hidden.
        const setUp = Boolean(meta?.label_schema);
        out.push({
          path,
          tier: setUp ? "annotate" : "explore",
          setUp,
          system,
          unsupported,
        });
      }
    }
    return out;
  }, [rowPaths, search, datasetSchemas, docMode, doc]);

  const sections = useMemo(() => {
    const order = new Map(activeFields.map((p, i) => [p, i]));
    const byStoredOrder = (a: RowData, b: RowData) =>
      (order.get(a.path) ?? 1e9) - (order.get(b.path) ?? 1e9) ||
      a.path.localeCompare(b.path);
    const visible = rows.filter((r) => r.tier !== "hidden");
    // Selectable (hideable) rows first; every un-selectable row — the
    // protected paths that can be set up but never hidden, then system
    // fields — sits together at the bottom of Active.
    const hideable = (r: RowData) =>
      !r.system && !r.unsupported && !PROTECTED_PATHS.has(r.path);
    return {
      scanned: visible
        .filter((r) => r.setUp && hideable(r))
        .sort(byStoredOrder),
      unscanned: visible.filter((r) => !r.setUp && hideable(r)),
      unhideable: visible
        .filter(
          (r) => !r.system && !r.unsupported && PROTECTED_PATHS.has(r.path),
        )
        .sort(byStoredOrder),
      system: visible.filter((r) => r.system || r.unsupported),
      hidden: rows.filter((r) => r.tier === "hidden"),
    };
  }, [rows, activeFields]);

  // Batched per-row display metadata (doc-aware via the envelope
  // overlay in `effectiveLabelSchemasData`).
  const rowTypes = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(rowPaths.map((p) => [p, get(fieldType(p))])),
        ),
      [rowPaths],
    ),
  );
  const rowAttrCounts = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(
            rowPaths.map((p) => [p, get(fieldAttributeCount(p))]),
          ),
        ),
      [rowPaths],
    ),
  );

  return { rowPaths, rows, sections, activeSet, rowTypes, rowAttrCounts };
};
