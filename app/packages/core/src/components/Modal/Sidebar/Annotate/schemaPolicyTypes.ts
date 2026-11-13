/**
 * Label-schema document and stage-policy types shared by the Annotate
 * sidebar, the Schema Manager and (in FiftyOne Teams) the workflow
 * task workspace. Workflow-neutral: the documents are authored in the
 * Schema Manager; a workflow stage only references one by id.
 */

/** Summary row for a schema selector (stage picker, schema lens). */
export interface LabelSchemaDocSummary {
  id: string;
  name: string;
}

/**
 * A named label-schema doc resolved server-side (see
 * ``fiftyone.core.label_schema_docs.resolve``): ``label_schemas`` is the
 * envelope meta-map the Annotate sidebar renders from, ``active`` the
 * annotate-tier field list, ``excluded_paths`` the hidden set feeding
 * the silent Explore exclusion channel.
 */
export interface ResolvedLabelSchemaDoc {
  id: string;
  name: string;
  label_schemas: Record<string, unknown>;
  active: string[];
  excluded_paths: string[];
  /** ``<field>.<attr>`` entries hidden by the doc (sidebar filtering). */
  excluded_attr_paths?: string[];
  /** DB paths (``<field>.<list_key>.<attr>``) of hidden attributes. */
  excluded_attr_db_paths?: string[];
}

export type StageFieldAccess = "hidden" | "read_only" | "editable";

export interface StageFieldPolicy {
  visibility: StageFieldAccess;
  /**
   * Spatial types only: the box/polyline itself. `read_only` = no
   * draw/move/resize while attribute inputs stay live. The bbox can't
   * be hidden separately from its field.
   */
  bbox?: "editable" | "read_only";
  /** Per-attribute tri-state overrides; `"*"` is the attribute default. */
  attributes?: Record<string, StageFieldAccess>;
  /**
   * Per-class overrides; `"*"` is the class default. `hidden` classes
   * are not offered as options — labels carrying them render but are
   * class-locked.
   */
  classes?: Record<string, StageFieldAccess>;
}

/**
 * A task's stage ``schema_overlay``, resolved server-side. Null/absent
 * means unrestricted (no overlay on the stage, or older BE). Applies to
 * everyone who opens the task — managers included (2026-07-28
 * decision: the overlay is the stage's working surface, not a
 * per-role privilege).
 */
export interface StageSchemaPolicy {
  fields: Record<string, StageFieldPolicy>;
  /** Access for fields without an explicit entry. */
  default: StageFieldAccess;
  /** Field paths the workspace view must exclude (hidden fields). */
  excluded_paths: string[];
  /**
   * Copied from the stage's ``label_schema_doc`` when one governs:
   * ``<field>.<attr>`` entries hidden by the doc, and their DB paths.
   */
  excluded_attr_paths?: string[];
  excluded_attr_db_paths?: string[];
}
