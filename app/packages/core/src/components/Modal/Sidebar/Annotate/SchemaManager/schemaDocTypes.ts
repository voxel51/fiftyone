/**
 * Label-schema document shapes and the pure helpers that derive and
 * edit a doc's visibility. No hooks, no I/O: `useSchemaDocs` layers the
 * operator calls and the manager's doc-mode state on top of these.
 */

/**
 * Required/default sample+frame fields the server cannot serialize
 * without — mirrored from `fiftyone.core.label_schema_docs.PROTECTED_PATHS`.
 * Never
 * hidden, in any schema.
 */
export const PROTECTED_PATHS = new Set([
  "id",
  "filepath",
  // a reference-backed (multimodal) dataset's media identity
  "media_reference",
  "tags",
  "metadata",
  "created_at",
  "last_modified_at",
  "frames",
  "frames.id",
  "frames.frame_number",
  "frames.created_at",
  "frames.last_modified_at",
]);

/**
 * Label attributes a schema can never hide (mirrors the server's
 * ``PROTECTED_ATTRIBUTES``): identity (``id``), tagging (``tags``),
 * instance linking (``index``) and geometry the renderer needs. A
 * stored ``hidden`` tier on one of these is ignored.
 */
export const PROTECTED_ATTRIBUTES = new Set([
  "id",
  "tags",
  "index",
  "mask",
  "mask_path",
  "points",
  "bounding_box",
]);

/** Whether a field's attribute is hidden under the doc. */
export const docAttributeHidden = (
  doc: Pick<SchemaDoc, "visibility"> | null | undefined,
  path: string,
  attribute: string,
): boolean =>
  !PROTECTED_ATTRIBUTES.has(attribute) &&
  doc?.visibility?.fields?.[path]?.attributes?.[attribute] === "hidden";

export interface SchemaDocSummary {
  id: string;
  name: string;
  description?: string;
  updated_at?: number;
  version?: number;
}

export interface SchemaDocContentAttribute {
  name: string;
  type?: string | null;
  read_only?: boolean;
  [key: string]: unknown;
}

export interface SchemaDocContentEntry {
  type?: string | null;
  classes?: string[];
  attributes?: SchemaDocContentAttribute[];
  bbox?: "editable" | "read_only";
  label?: "editable" | "read_only";
  read_only?: boolean;
  [key: string]: unknown;
}

export type SchemaDocTier = "annotate" | "explore" | "hidden";

export interface SchemaDocFieldVisibility {
  tier?: SchemaDocTier;
  /** Omitted attribute = "annotate". */
  attributes?: Record<string, SchemaDocTier>;
}

export interface SchemaDocVisibility {
  /** Tier for unlisted fields; omitted = "explore". */
  default?: "explore" | "hidden";
  fields: Record<string, SchemaDocFieldVisibility>;
}

export interface SchemaDoc {
  id: string;
  name: string;
  description?: string;
  version?: number;
  label_schema: Record<string, SchemaDocContentEntry>;
  visibility: SchemaDocVisibility;
}

export type OkResponse = { ok: boolean; error?: string };
export type ListResponse = OkResponse & { schemas?: SchemaDocSummary[] };
/** Attribute names per label field path. */
export type AttributesByPath = Record<string, string[]>;
export type UndeclaredResponse = OkResponse & { undeclared?: AttributesByPath };
export type DeclareResponse = OkResponse & {
  declared?: string[];
  skipped?: AttributesByPath;
};
export interface ResolvedSchemaDoc {
  id?: string;
  name?: string;
  active?: string[];
  excluded_paths?: string[];
  excluded_attr_paths?: string[];
  excluded_attr_db_paths?: string[];
  label_schemas?: Record<string, unknown>;
}
export type DocResponse = OkResponse & {
  schema?: SchemaDoc;
  resolved?: ResolvedSchemaDoc;
};

/**
 * The field tier under a doc. Mirrors `label_schema_docs._field_tier`:
 * explicit `hidden` wins; a scanned (content-bearing) field is
 * annotate — there is no explore-only state for a set-up field, so a
 * legacy explicit `explore` on one reads as annotate; an unscanned
 * field is explore-only unless the doc's `default` hides it (an
 * explicit non-hidden tier on it still means visible).
 */
export const docFieldTier = (
  doc: SchemaDoc,
  path: string,
  protectedPaths: ReadonlySet<string> = PROTECTED_PATHS,
): string => {
  const explicit = doc.visibility.fields?.[path]?.tier;
  // Required/system fields can never be hidden (the server refuses to
  // exclude them — see PROTECTED_PATHS and `useProtectedPaths`); they
  // always read as visible.
  if (protectedPaths.has(path)) {
    return path in doc.label_schema ? "annotate" : "explore";
  }
  if (explicit === "hidden") return "hidden";
  if (path in doc.label_schema) return "annotate";
  if (explicit === "annotate" || explicit === "explore") return "explore";
  return doc.visibility.default === "hidden" ? "hidden" : "explore";
};

/** A copy of `doc.visibility` with one field's tier replaced. */
export const withFieldTier = (
  visibility: SchemaDocVisibility,
  path: string,
  tier: SchemaDocTier,
): SchemaDocVisibility => ({
  ...visibility,
  fields: {
    ...visibility.fields,
    [path]: { ...visibility.fields?.[path], tier },
  },
});

/** A copy of `doc.visibility` with one field's explicit tier removed
 * (its attributes are kept); the field's tier is derived again. */
export const withoutFieldTier = (
  visibility: SchemaDocVisibility,
  path: string,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  if (!entry) return visibility;
  const { tier: _tier, ...rest } = entry;
  const fields = { ...visibility.fields };
  if (Object.keys(rest).length) {
    fields[path] = rest;
  } else {
    delete fields[path];
  }
  return { ...visibility, fields };
};

/**
 * A copy of `doc.visibility` with the field's `explore` attribute tiers
 * dropped. Attribute read-only access now lives on the content
 * (`attribute.read_only`); the explore tier was the earlier, icon-era
 * way to say the same thing, and saving the field retires it. Hidden
 * attribute tiers are kept.
 */
export const withoutExploreAttributeTiers = (
  visibility: SchemaDocVisibility,
  path: string,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  if (!entry?.attributes) return visibility;
  const attributes = Object.fromEntries(
    Object.entries(entry.attributes).filter(([, tier]) => tier !== "explore"),
  );
  const next = { ...entry } as SchemaDocFieldVisibility;
  if (Object.keys(attributes).length) {
    next.attributes = attributes;
  } else {
    delete next.attributes;
  }
  return { ...visibility, fields: { ...visibility.fields, [path]: next } };
};

/**
 * A copy of `doc.visibility` with several attributes' tiers applied at
 * once: `hidden` is recorded, anything else clears the entry (an
 * omitted attribute is annotate).
 */
export const withAttributeTiers = (
  visibility: SchemaDocVisibility,
  path: string,
  tiers: Record<string, SchemaDocTier>,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  const attributes = { ...entry?.attributes };
  for (const [name, tier] of Object.entries(tiers)) {
    if (tier === "hidden" && !PROTECTED_ATTRIBUTES.has(name)) {
      attributes[name] = "hidden";
    } else {
      delete attributes[name];
    }
  }
  const next = { ...entry } as SchemaDocFieldVisibility;
  if (Object.keys(attributes).length) {
    next.attributes = attributes;
  } else {
    delete next.attributes;
  }
  return { ...visibility, fields: { ...visibility.fields, [path]: next } };
};

/** A copy of `doc.visibility` with one attribute's tier replaced. */
export const withAttributeTier = (
  visibility: SchemaDocVisibility,
  path: string,
  attribute: string,
  tier: SchemaDocTier,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  return {
    ...visibility,
    fields: {
      ...visibility.fields,
      [path]: {
        ...entry,
        attributes: { ...entry?.attributes, [attribute]: tier },
      },
    },
  };
};
