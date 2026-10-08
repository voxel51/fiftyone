/**
 * Row model for the Schema Manager overview: which fields appear, in
 * which section, with which display metadata. Pure derivation from the
 * dataset schema, the selected doc and the search filter.
 */

import * as fos from "@fiftyone/state";
import type { StrictField } from "@fiftyone/utilities";
import { atom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
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
  /** System fields: never annotatable, never hideable. */
  system: RowData[];
  hidden: RowData[];
}

/**
 * The display type of a field the annotation schemas do not cover, e.g.
 * ``GeoLocation`` or ``Dict``.
 */
const datasetFieldType = (field: StrictField) => {
  const cls = field.embeddedDocType || field.ftype || "";
  return (
    cls
      .split(".")
      .pop()
      ?.replace(/Field$/, "") ?? ""
  );
};

/**
 * The dataset's top-level fields (``frames.``-prefixed frame fields for
 * video), mapped to their display types — the same fields a schema can
 * hide server-side, including those that cannot be annotated.
 */
export const useDatasetFieldTypes = (): Record<string, string> => {
  const sampleFields = useRecoilValue(fos.sampleFields);
  const frameFields = useRecoilValue(fos.frameFields);
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of sampleFields ?? []) {
      if (field.name !== "frames") out[field.name] = datasetFieldType(field);
    }
    for (const field of frameFields ?? []) {
      out[`frames.${field.name}`] = datasetFieldType(field);
    }
    return out;
  }, [sampleFields, frameFields]);
};

export const useOverviewRows = ({
  datasetSchemas,
  datasetFields = {},
  protectedPaths = PROTECTED_PATHS,
  doc,
  docMode,
  search,
  activeFields,
}: {
  datasetSchemas: Record<string, unknown> | null;
  /** All top-level dataset fields, see :func:`useDatasetFieldTypes`. */
  datasetFields?: Record<string, string>;
  /** The paths no schema can hide, see `useProtectedPaths`. */
  protectedPaths?: ReadonlySet<string>;
  doc: SchemaDoc | null;
  docMode: boolean;
  search: string;
  activeFields: string[];
}) => {
  const rowPaths = useMemo(() => {
    // Fields that cannot be annotated (e.g. GeoLocation) have no
    // annotation schema, but a schema can still hide them
    const paths = new Set<string>([
      ...Object.keys(datasetSchemas ?? {}),
      ...Object.keys(datasetFields),
    ]);
    if (docMode && doc) {
      for (const p of Object.keys(doc.label_schema)) paths.add(p);
      for (const p of Object.keys(doc.visibility.fields ?? {})) paths.add(p);
    }
    return [...paths].sort();
  }, [datasetSchemas, datasetFields, doc, docMode]);

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
      // A dataset field without an annotation schema cannot be annotated
      const unsupported =
        Boolean(meta?.unsupported) || (!meta && path in datasetFields);
      if (docMode && doc) {
        out.push({
          path,
          tier: docFieldTier(doc, path, protectedPaths) as SchemaDocTier,
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
  }, [
    rowPaths,
    search,
    datasetSchemas,
    datasetFields,
    docMode,
    doc,
    protectedPaths,
  ]);

  const sections = useMemo(() => {
    const order = new Map(activeFields.map((p, i) => [p, i]));
    const byStoredOrder = (a: RowData, b: RowData) =>
      (order.get(a.path) ?? 1e9) - (order.get(b.path) ?? 1e9) ||
      a.path.localeCompare(b.path);
    const visible = rows.filter((r) => r.tier !== "hidden");
    // Selectable (hideable) rows first, unsupported ones (hideable but
    // never annotatable) last among them; every un-selectable row — the
    // protected paths that can never be hidden, then system fields —
    // sits together at the bottom of Active.
    const hideable = (r: RowData) => !r.system && !protectedPaths.has(r.path);
    const unsupportedLast = (a: RowData, b: RowData) =>
      Number(a.unsupported) - Number(b.unsupported);
    return {
      scanned: visible
        .filter((r) => r.setUp && hideable(r))
        .sort(byStoredOrder),
      unscanned: visible
        .filter((r) => !r.setUp && hideable(r))
        .sort(unsupportedLast),
      unhideable: visible
        .filter((r) => !r.system && protectedPaths.has(r.path))
        .sort(byStoredOrder),
      system: visible.filter((r) => r.system),
      hidden: rows.filter((r) => r.tier === "hidden"),
    };
  }, [rows, activeFields, protectedPaths]);

  // Batched per-row display metadata (doc-aware via the envelope
  // overlay in `effectiveLabelSchemasData`).
  const rowTypes = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(
            rowPaths.map((p) => [p, get(fieldType(p)) ?? datasetFields[p]]),
          ),
        ),
      [rowPaths, datasetFields],
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
